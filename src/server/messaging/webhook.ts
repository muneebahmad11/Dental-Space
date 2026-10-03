import { createHash } from 'node:crypto';
import { and,asc,eq,sql } from 'drizzle-orm';
import { z } from 'zod';
import { deliveryRank } from '../../lib/messaging/contracts.ts';
import type { Database } from '../auth/context.ts';
import { communicationEvents,communicationJobs,messagingPreferences,messagingWebhookReceipts } from '../db/schema/communications.ts';
import { AppError } from '../http/errors.ts';
import type { MessagingConfig } from './config.ts';
const status=z.object({id:z.string().min(1).max(200),recipient_id:z.string().regex(/^[1-9]\d{7,14}$/),status:z.enum(['sent','delivered','read','failed']),timestamp:z.string().regex(/^\d{1,12}$/)});
const incoming=z.object({id:z.string().min(1).max(200),from:z.string().regex(/^[1-9]\d{7,14}$/),timestamp:z.string().regex(/^\d{1,12}$/),type:z.string(),text:z.object({body:z.string().max(4096)}).optional()});
const envelope=z.object({object:z.literal('whatsapp_business_account'),entry:z.array(z.object({id:z.string(),changes:z.array(z.object({field:z.string(),value:z.object({metadata:z.object({phone_number_id:z.string()}),statuses:z.array(status).max(100).optional(),messages:z.array(incoming).max(100).optional()})})).max(100)})).max(100)});
export async function applyDeliveryEvents(db:Database,config:MessagingConfig){
 return db.transaction(async tx=>{
  const receipts=await tx.select().from(messagingWebhookReceipts).where(and(eq(messagingWebhookReceipts.clinicId,config.WHATSAPP_CLINIC_ID),eq(messagingWebhookReceipts.processed,false),sql`(${messagingWebhookReceipts.status}='opt_out' or exists(select 1 from clinic_app.communication_jobs j where j.clinic_id=${messagingWebhookReceipts.clinicId} and j.provider_message_id=${messagingWebhookReceipts.providerMessageId} and j.recipient=${messagingWebhookReceipts.recipient}))`)).orderBy(asc(messagingWebhookReceipts.providerTimestamp),asc(messagingWebhookReceipts.id)).limit(100).for('update',{skipLocked:true});
  for(const receipt of receipts){
   if(receipt.status==='opt_out'){
    const changed=await tx.update(messagingPreferences).set({enabled:false,version:sql`${messagingPreferences.version}+1`,evidence:'Patient WhatsApp opt-out',updatedAt:new Date()}).where(and(eq(messagingPreferences.clinicId,config.WHATSAPP_CLINIC_ID),eq(messagingPreferences.recipient,receipt.recipient),eq(messagingPreferences.enabled,true))).returning();
    for(const pref of changed){await tx.update(communicationJobs).set({state:'cancelled',lastCode:'PATIENT_OPTED_OUT',leaseUntil:null,leaseToken:null}).where(and(eq(communicationJobs.clinicId,pref.clinicId),eq(communicationJobs.patientId,pref.patientId),sql`${communicationJobs.state} in ('queued','processing')`));}
   }else{
    const [job]=await tx.select().from(communicationJobs).where(and(eq(communicationJobs.clinicId,config.WHATSAPP_CLINIC_ID),eq(communicationJobs.providerMessageId,receipt.providerMessageId),eq(communicationJobs.recipient,receipt.recipient))).for('update');
    if(!job)continue; // Keep an early delivery event until the send response records the provider ID.
    await tx.insert(communicationEvents).values({clinicId:job.clinicId,branchId:job.branchId,jobId:job.id,eventKey:receipt.eventKey,kind:receipt.status,occurredAt:receipt.providerTimestamp}).onConflictDoNothing();
    if(deliveryRank(receipt.status)>deliveryRank(job.deliveryStatus??'')||(!job.deliveryStatus&&receipt.status==='failed'))await tx.update(communicationJobs).set({deliveryStatus:receipt.status}).where(eq(communicationJobs.id,job.id));
   }
   await tx.update(messagingWebhookReceipts).set({processed:true}).where(eq(messagingWebhookReceipts.id,receipt.id));
  }
 });
}
export async function receiveWebhook(db:Database,raw:unknown,config:MessagingConfig){
 const parsed=envelope.safeParse(raw);if(!parsed.success)throw new AppError(400,'INVALID_WEBHOOK','Invalid WhatsApp webhook.');
 await db.transaction(async tx=>{
  for(const entry of parsed.data.entry){if(entry.id!==config.WHATSAPP_BUSINESS_ACCOUNT_ID)continue;
   for(const change of entry.changes){if(change.field!=='messages'||change.value.metadata.phone_number_id!==config.WHATSAPP_PHONE_NUMBER_ID)continue;
    const events=[...(change.value.statuses??[]).map(s=>({providerMessageId:s.id,recipient:s.recipient_id,status:s.status,timestamp:s.timestamp})),...(change.value.messages??[]).filter(m=>m.type==='text'&&/^(stop|unsubscribe|cancel|opt out)$/i.test(m.text?.body.trim()??'')).map(m=>({providerMessageId:m.id,recipient:m.from,status:'opt_out',timestamp:m.timestamp}))];
    for(const e of events){const eventKey=createHash('sha256').update(JSON.stringify([config.WHATSAPP_PHONE_NUMBER_ID,e])).digest('hex');await tx.insert(messagingWebhookReceipts).values({clinicId:config.WHATSAPP_CLINIC_ID,eventKey,providerMessageId:e.providerMessageId,recipient:e.recipient,status:e.status,providerTimestamp:new Date(Number(e.timestamp)*1000)}).onConflictDoNothing();}
   }
  }
 });
 await applyDeliveryEvents(db,config);
}

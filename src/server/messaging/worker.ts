import { randomUUID } from 'node:crypto';
import { and,eq,lte,sql } from 'drizzle-orm';
import { recipientNumber,retryDelay } from '../../lib/messaging/contracts.ts';
import { authorize,type Database } from '../auth/context.ts';
import { appointments } from '../db/schema/appointments.ts';
import { reminderStatuses } from '../../lib/appointments/contracts.ts';
import { appUsers,memberships } from '../db/schema/organization.ts';
import { patients } from '../db/schema/patients.ts';
import { communicationEvents,communicationJobs,messagingPreferences } from '../db/schema/communications.ts';
import { contactAllowed } from '../../lib/contact-preferences/contracts.ts';
import { currentContactPreferences } from '../patient-profile/contact.ts';
import type { MessagingConfig } from './config.ts';
import { communicationContext } from './service.ts';
import type { MessageSender,SendOutcome } from './provider.ts';
import { applyDeliveryEvents } from './webhook.ts';
export async function claimMessage(db:Database,config:MessagingConfig){
 return db.transaction(async tx=>{
  const expired=await tx.update(communicationJobs).set({state:'review',lastCode:'SEND_LEASE_EXPIRED',leaseUntil:null,leaseToken:null}).where(and(eq(communicationJobs.clinicId,config.WHATSAPP_CLINIC_ID),eq(communicationJobs.state,'sending'),lte(communicationJobs.leaseUntil,new Date()))).returning();
  for(const job of expired)await tx.insert(communicationEvents).values({clinicId:job.clinicId,branchId:job.branchId,jobId:job.id,eventKey:randomUUID(),kind:'review',code:'SEND_LEASE_EXPIRED'});
  await tx.update(communicationJobs).set({state:sql`case when ${communicationJobs.attempts}>=5 then 'failed' else 'queued' end`,lastCode:'PROCESSING_LEASE_EXPIRED',leaseUntil:null,leaseToken:null}).where(and(eq(communicationJobs.clinicId,config.WHATSAPP_CLINIC_ID),eq(communicationJobs.state,'processing'),lte(communicationJobs.leaseUntil,new Date())));
  const [job]=await tx.select().from(communicationJobs).where(and(eq(communicationJobs.clinicId,config.WHATSAPP_CLINIC_ID),eq(communicationJobs.state,'queued'),lte(communicationJobs.availableAt,new Date()),sql`${communicationJobs.attempts}<5`)).orderBy(communicationJobs.availableAt,communicationJobs.id).limit(1).for('update',{skipLocked:true});
  if(!job)return null;
  const [claimed]=await tx.update(communicationJobs).set({state:'processing',attempts:job.attempts+1,leaseToken:randomUUID(),leaseUntil:new Date(Date.now()+90000)}).where(eq(communicationJobs.id,job.id)).returning();
  await tx.insert(communicationEvents).values({clinicId:job.clinicId,branchId:job.branchId,jobId:job.id,eventKey:randomUUID(),kind:'claimed',code:`ATTEMPT_${claimed.attempts}`});return claimed;
 });
}
export async function dispatchClaimedMessage(db:Database,config:MessagingConfig,job:typeof communicationJobs.$inferSelect,sender:MessageSender){
 const owns=and(eq(communicationJobs.id,job.id),eq(communicationJobs.clinicId,config.WHATSAPP_CLINIC_ID),eq(communicationJobs.leaseToken,job.leaseToken!));
 const ready=await db.transaction(async tx=>{
  const [current]=await tx.select().from(communicationJobs).where(and(owns,eq(communicationJobs.state,'processing'))).for('update');if(!current)return false;
  let code:string|null=null;
  const [actor]=await tx.select({authUserId:appUsers.authUserId}).from(memberships).innerJoin(appUsers,eq(appUsers.id,memberships.userId)).where(and(eq(memberships.id,job.actorMembershipId),eq(memberships.clinicId,job.clinicId)));
  const scope={authUserId:actor?.authUserId??'',clinicId:job.clinicId,branchId:job.branchId};
  try{
   const c=await communicationContext(tx,scope,'communication.send');
   const [patient]=await tx.select().from(patients).where(and(eq(patients.clinicId,job.clinicId),eq(patients.id,job.patientId)));
   const [pref]=await tx.select().from(messagingPreferences).where(and(eq(messagingPreferences.clinicId,job.clinicId),eq(messagingPreferences.patientId,job.patientId)));
   if(!pref?.enabled||pref.version!==job.preferenceVersion||pref.recipient!==job.recipient||recipientNumber(patient?.phone??'')!==job.recipient)code='CONSENT_CHANGED';
   const template=config.templates.find(t=>t.name===job.template&&t.language===job.language);
   if(!template||template.parameters.length!==job.parameters.length)code='TEMPLATE_CHANGED';
   else if(!contactAllowed(await currentContactPreferences(tx,job.clinicId,job.patientId),'whatsapp',job.appointmentId?'appointment':template.purpose))code='CONTACT_NOT_ALLOWED';
   if(job.appointmentId){authorize(c,'appointment.read');const [a]=await tx.select().from(appointments).where(and(eq(appointments.id,job.appointmentId),eq(appointments.clinicId,job.clinicId),eq(appointments.branchId,job.branchId),eq(appointments.patientId,job.patientId)));if(!a||!(reminderStatuses as readonly string[]).includes(a.status)||a.version!==job.appointmentVersion||+a.startsAt<=Date.now())code='STALE_APPOINTMENT';}
  }catch{code='AUTHORIZATION_UNAVAILABLE';}
  const next=code?'cancelled':'sending';
  await tx.update(communicationJobs).set({state:next,lastCode:code}).where(owns);
  await tx.insert(communicationEvents).values({clinicId:job.clinicId,branchId:job.branchId,jobId:job.id,eventKey:randomUUID(),kind:next,code});return !code;
 });
 if(!ready)return;
 let outcome:SendOutcome;
 try{outcome=await sender({recipient:job.recipient,template:job.template,language:job.language,parameters:job.parameters});}catch{outcome={kind:'review',code:'PROVIDER_CONNECTION_AMBIGUOUS'};}
 await db.transaction(async tx=>{
  const state=outcome.kind==='accepted'?'submitted':outcome.kind==='retry'?(job.attempts<5?'queued':'failed'):outcome.kind;
  const code=outcome.kind==='accepted'?null:outcome.code;
  const [updated]=await tx.update(communicationJobs).set({state,providerMessageId:outcome.kind==='accepted'?outcome.providerMessageId:null,lastCode:code,leaseUntil:null,leaseToken:null,...(state==='queued'?{availableAt:new Date(Date.now()+retryDelay(job.attempts)*1000)}:{})}).where(and(owns,eq(communicationJobs.state,'sending'))).returning({id:communicationJobs.id});
  if(updated)await tx.insert(communicationEvents).values({clinicId:job.clinicId,branchId:job.branchId,jobId:job.id,eventKey:randomUUID(),kind:state,code});
 });
 await applyDeliveryEvents(db,config);
}
export async function processOneMessage(db:Database,config:MessagingConfig,sender:MessageSender){const job=await claimMessage(db,config);if(!job)return false;await dispatchClaimedMessage(db,config,job,sender);return true;}

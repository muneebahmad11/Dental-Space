import { createHash,randomUUID } from 'node:crypto';
import { and,desc,eq,sql } from 'drizzle-orm';
import { z } from 'zod';
import { messageInput,preferenceInput,recipientNumber } from '../../lib/messaging/contracts.ts';
import { authorize,resolveContext,type Database } from '../auth/context.ts';
import { appointments } from '../db/schema/appointments.ts';
import { communicationJobs,messagingPreferences } from '../db/schema/communications.ts';
import { patients } from '../db/schema/patients.ts';
import { auditEvents } from '../db/schema/security.ts';
import { AppError } from '../http/errors.ts';
import type { PatientScope } from '../patients/service.ts';
import type { MessagingConfig } from './config.ts';
export function parse<T>(schema:z.ZodType<T>,raw:unknown):T{const r=schema.safeParse(raw);if(!r.success)throw new AppError(400,'INVALID_INPUT','Check the communication details.');return r.data;}
export async function communicationContext(db:Database,scope:PatientScope,permission:'communication.read'|'communication.send'|'communication.preferences.write'){
 parse(z.object({authUserId:z.uuid(),clinicId:z.uuid(),branchId:z.uuid()}),scope);
 const c=await resolveContext(db,scope.authUserId,scope.clinicId,scope.branchId);authorize(c,permission);authorize(c,'patient.demographics.read');return c;
}
export async function communicationAudit(db:Database,scope:PatientScope,actor:string,id:string,action:string){await db.insert(auditEvents).values({clinicId:scope.clinicId,branchId:scope.branchId,actorMembershipId:actor,entityId:id,entityType:'communication',action,requestId:randomUUID()});}
const scoped=(s:PatientScope)=>and(eq(communicationJobs.clinicId,s.clinicId),eq(communicationJobs.branchId,s.branchId));
export async function setMessagingPreference(db:Database,scope:PatientScope,raw:unknown){
 const input=parse(preferenceInput,raw);
 return db.transaction(async tx=>{
  const c=await communicationContext(tx,scope,'communication.preferences.write');
  const [patient]=await tx.select().from(patients).where(and(eq(patients.clinicId,scope.clinicId),eq(patients.id,input.patientId)));
  if(!patient)throw new AppError(404,'PATIENT_NOT_FOUND','Patient is not available in this clinic.');
  const recipient=recipientNumber(patient.phone);if(!recipient)throw new AppError(400,'PHONE_INVALID','Save a patient phone with its international country code first.');
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${scope.clinicId+':preference:'+input.patientId},0))`);
  const where=and(eq(messagingPreferences.clinicId,scope.clinicId),eq(messagingPreferences.patientId,input.patientId));
  const [old]=await tx.select().from(messagingPreferences).where(where);
  if((old?.version??0)!==input.expectedVersion)throw new AppError(409,'PREFERENCE_CONFLICT','Preferences changed. Reload before saving.');
  const values={clinicId:scope.clinicId,patientId:input.patientId,branchId:scope.branchId,actorMembershipId:c.membershipId,recipient,enabled:input.enabled,evidence:input.evidence,version:input.expectedVersion+1,updatedAt:new Date()};
  const [row]=old?await tx.update(messagingPreferences).set(values).where(where).returning():await tx.insert(messagingPreferences).values(values).returning();
  if(!input.enabled)await tx.update(communicationJobs).set({state:'cancelled',lastCode:'OPTED_OUT',leaseToken:null,leaseUntil:null}).where(and(eq(communicationJobs.clinicId,scope.clinicId),eq(communicationJobs.patientId,input.patientId),sql`${communicationJobs.state} in ('queued','processing')`));
  await communicationAudit(tx,scope,c.membershipId,input.patientId,input.enabled?'communication.opted_in':'communication.opted_out');return row;
 });
}
export async function queueMessage(db:Database,scope:PatientScope,raw:unknown,config:MessagingConfig|null){
 const input=parse(messageInput,raw);
 if(!config||config.WHATSAPP_CLINIC_ID!==scope.clinicId)throw new AppError(503,'WHATSAPP_NOT_CONFIGURED','WhatsApp is not configured for this clinic.');
 const template=config.templates.find(t=>t.name===input.template&&t.language===input.language);
 if(!template||template.parameters.length!==input.parameters.length)throw new AppError(400,'TEMPLATE_INVALID','Select a configured approved template and complete its fields.');
 const scheduledAt=input.scheduledAt?new Date(input.scheduledAt):null;
 if(scheduledAt && +scheduledAt>Date.now()+31*86400000)throw new AppError(400,'SCHEDULE_INVALID','Schedule messages within 31 days.');
 const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 return db.transaction(async tx=>{
  const c=await communicationContext(tx,scope,'communication.send');
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${scope.clinicId+':'+scope.branchId+':message:'+input.operationId},0))`);
  const [existing]=await tx.select().from(communicationJobs).where(and(scoped(scope),eq(communicationJobs.operationId,input.operationId)));
  if(existing){if(existing.payloadHash!==hash)throw new AppError(409,'OPERATION_CONFLICT','This message key has different details.');return {id:existing.id,state:existing.state};}
  const [patient]=await tx.select().from(patients).where(and(eq(patients.clinicId,scope.clinicId),eq(patients.id,input.patientId)));
  if(!patient)throw new AppError(404,'PATIENT_NOT_FOUND','Patient is not available in this clinic.');
  const [pref]=await tx.select().from(messagingPreferences).where(and(eq(messagingPreferences.clinicId,scope.clinicId),eq(messagingPreferences.patientId,input.patientId)));
  if(!pref?.enabled||pref.recipient!==recipientNumber(patient.phone))throw new AppError(409,'CONSENT_REQUIRED','Record consent for the patient’s current phone before sending.');
  if(input.appointmentId){authorize(c,'appointment.read');const [a]=await tx.select().from(appointments).where(and(eq(appointments.clinicId,scope.clinicId),eq(appointments.branchId,scope.branchId),eq(appointments.id,input.appointmentId),eq(appointments.patientId,input.patientId)));if(!a||a.version!==input.appointmentVersion||a.status!=='booked'||+a.startsAt<=Date.now())throw new AppError(409,'STALE_APPOINTMENT','Select a current upcoming booked appointment.');}
  const [row]=await tx.insert(communicationJobs).values({clinicId:scope.clinicId,branchId:scope.branchId,patientId:input.patientId,actorMembershipId:c.membershipId,operationId:input.operationId,payloadHash:hash,recipient:pref.recipient,preferenceVersion:pref.version,template:input.template,language:input.language,parameters:input.parameters,appointmentId:input.appointmentId,appointmentVersion:input.appointmentVersion,availableAt:scheduledAt??new Date()}).returning({id:communicationJobs.id,state:communicationJobs.state});
  await communicationAudit(tx,scope,c.membershipId,row.id,'communication.queued');return row;
 });
}
export async function listCommunications(db:Database,scope:PatientScope,raw:unknown,config:MessagingConfig|null){
 const q=parse(z.object({patientId:z.uuid().optional(),offset:z.coerce.number().int().min(0).max(100000).default(0)}),raw);
 await communicationContext(db,scope,'communication.read');
 const jobs=await db.select({id:communicationJobs.id,patientId:communicationJobs.patientId,patientName:patients.name,template:communicationJobs.template,state:communicationJobs.state,deliveryStatus:communicationJobs.deliveryStatus,attempts:communicationJobs.attempts,lastCode:communicationJobs.lastCode,scheduledAt:communicationJobs.availableAt,createdAt:communicationJobs.createdAt}).from(communicationJobs).innerJoin(patients,and(eq(patients.clinicId,communicationJobs.clinicId),eq(patients.id,communicationJobs.patientId))).where(and(scoped(scope),q.patientId?eq(communicationJobs.patientId,q.patientId):undefined)).orderBy(desc(communicationJobs.createdAt),desc(communicationJobs.id)).limit(50).offset(q.offset);
 const [preference]=q.patientId?await db.select({enabled:messagingPreferences.enabled,version:messagingPreferences.version,recipient:messagingPreferences.recipient,updatedAt:messagingPreferences.updatedAt}).from(messagingPreferences).where(and(eq(messagingPreferences.clinicId,scope.clinicId),eq(messagingPreferences.patientId,q.patientId))):[];
 const active=Boolean(config&&config.WHATSAPP_CLINIC_ID===scope.clinicId);
 return {communications:jobs,preference:preference??null,configured:active,templates:active?config?.templates:[]};
}
export async function cancelMessage(db:Database,scope:PatientScope,id:string){
 parse(z.uuid(),id);return db.transaction(async tx=>{
  const c=await communicationContext(tx,scope,'communication.send');
  const [row]=await tx.update(communicationJobs).set({state:'cancelled',lastCode:'CANCELLED_BY_STAFF',leaseUntil:null,leaseToken:null}).where(and(scoped(scope),eq(communicationJobs.id,id),sql`${communicationJobs.state} in ('queued','processing')`)).returning({id:communicationJobs.id,state:communicationJobs.state});
  if(!row)throw new AppError(409,'MESSAGE_CONFLICT','Message was sent, started sending, or is no longer queued.');
  await communicationAudit(tx,scope,c.membershipId,id,'communication.cancelled');return row;
 });
}

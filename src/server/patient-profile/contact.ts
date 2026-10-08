import { createHash,randomUUID } from 'node:crypto';
import { and,desc,eq,sql } from 'drizzle-orm';
import { z } from 'zod';
import { saveContactPreferencesInput,type ContactPreferenceBody } from '../../lib/contact-preferences/contracts.ts';
import { authorize,resolveContext,type Database } from '../auth/context.ts';
import { contactPreferences,contactPreferenceVersions } from '../db/schema/contact-preferences.ts';
import { appUsers,memberships } from '../db/schema/organization.ts';
import { patients } from '../db/schema/patients.ts';
import { auditEvents } from '../db/schema/security.ts';
import { AppError } from '../http/errors.ts';
import type { PatientScope } from '../patients/service.ts';
const parse=<T>(schema:z.ZodType<T>,value:unknown):T=>{const r=schema.safeParse(value);if(!r.success)throw new AppError(400,'INVALID_INPUT','Check the contact preferences and reason for the change.');return r.data;};
async function context(db:Database,s:PatientScope,patientId:string,write=false){
 parse(z.object({authUserId:z.uuid(),clinicId:z.uuid(),branchId:z.uuid()}),s);parse(z.uuid(),patientId);
 const c=await resolveContext(db,s.authUserId,s.clinicId,s.branchId);authorize(c,'patient.demographics.read');if(write)authorize(c,'communication.preferences.write');
 const [patient]=await db.select({id:patients.id}).from(patients).where(and(eq(patients.clinicId,s.clinicId),eq(patients.id,patientId)));
 if(!patient)throw new AppError(404,'PATIENT_NOT_FOUND','Patient is not available in this clinic.');
 return c;
}
// Used by messaging at queue and send time; null means preferences were never recorded.
export async function currentContactPreferences(db:Database,clinicId:string,patientId:string):Promise<ContactPreferenceBody|null>{
 const [row]=await db.select({body:contactPreferences.body}).from(contactPreferences).where(and(eq(contactPreferences.clinicId,clinicId),eq(contactPreferences.patientId,patientId)));
 return row?.body??null;
}
export async function readContactPreferences(db:Database,s:PatientScope,patientId:string){
 return db.transaction(async tx=>{
  const c=await context(tx,s,patientId);
  const [current]=await tx.select({body:contactPreferences.body,version:contactPreferences.version,updatedAt:contactPreferences.updatedAt}).from(contactPreferences).where(and(eq(contactPreferences.clinicId,s.clinicId),eq(contactPreferences.patientId,patientId)));
  const history=await tx.select({version:contactPreferenceVersions.version,body:contactPreferenceVersions.body,reason:contactPreferenceVersions.reason,createdAt:contactPreferenceVersions.createdAt,actorName:appUsers.displayName}).from(contactPreferenceVersions).innerJoin(memberships,and(eq(memberships.id,contactPreferenceVersions.actorMembershipId),eq(memberships.clinicId,contactPreferenceVersions.clinicId))).innerJoin(appUsers,eq(appUsers.id,memberships.userId)).where(and(eq(contactPreferenceVersions.clinicId,s.clinicId),eq(contactPreferenceVersions.patientId,patientId))).orderBy(desc(contactPreferenceVersions.version)).limit(20);
  return {current:current??null,history,canWrite:c.permissions.has('communication.preferences.write')};
 },{isolationLevel:'repeatable read'});
}
export async function saveContactPreferences(db:Database,s:PatientScope,patientId:string,raw:unknown){
 const input=parse(saveContactPreferencesInput,raw);const {operationId,...payload}=input;const digest=createHash('sha256').update(JSON.stringify({patientId,...payload})).digest('hex');
 return db.transaction(async tx=>{
  const c=await context(tx,s,patientId,true);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${s.clinicId+':contact-preferences:'+patientId},0))`);
  const [old]=await tx.select().from(contactPreferenceVersions).where(and(eq(contactPreferenceVersions.clinicId,s.clinicId),eq(contactPreferenceVersions.operationId,operationId)));
  if(old){if(old.payloadHash!==digest||old.patientId!==patientId)throw new AppError(409,'OPERATION_CONFLICT','This operation key has different preference details.');return {version:old.version};}
  const [current]=await tx.select().from(contactPreferences).where(and(eq(contactPreferences.clinicId,s.clinicId),eq(contactPreferences.patientId,patientId))).for('update');
  const version=current?.version??0;if(version!==input.expectedVersion)throw new AppError(409,'PREFERENCES_CONFLICT','Contact preferences changed. Reload before saving.');
  const next={body:input.body,version:version+1,updatedAt:new Date()};
  if(current)await tx.update(contactPreferences).set(next).where(and(eq(contactPreferences.clinicId,s.clinicId),eq(contactPreferences.patientId,patientId)));
  else await tx.insert(contactPreferences).values({clinicId:s.clinicId,patientId,...next});
  await tx.insert(contactPreferenceVersions).values({clinicId:s.clinicId,branchId:s.branchId,patientId,version:version+1,body:input.body,reason:input.reason,actorMembershipId:c.membershipId,operationId,payloadHash:digest});
  await tx.insert(auditEvents).values({clinicId:s.clinicId,branchId:s.branchId,actorMembershipId:c.membershipId,entityId:patientId,entityType:'patient',action:'patient.contact_preferences.updated',requestId:randomUUID()});
  return {version:version+1};
 });
}

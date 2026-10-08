import { and,desc,eq,sql } from 'drizzle-orm';
import { z } from 'zod';
import { authorize,resolveContext,type Database } from '../auth/context.ts';
import { patients } from '../db/schema/patients.ts';
import { recentPatients } from '../db/schema/recent-patients.ts';
import { AppError } from '../http/errors.ts';
import type { PatientScope } from './service.ts';
const parse=<T>(schema:z.ZodType<T>,value:unknown):T=>{const r=schema.safeParse(value);if(!r.success)throw new AppError(400,'INVALID_INPUT','Select a valid patient.');return r.data;};
async function context(db:Database,s:PatientScope){parse(z.object({authUserId:z.uuid(),clinicId:z.uuid(),branchId:z.uuid()}),s);const c=await resolveContext(db,s.authUserId,s.clinicId,s.branchId);authorize(c,'patient.demographics.read');return c;}
// Records that this staff member opened the patient, for their own recent-patients list.
export async function recordPatientView(db:Database,s:PatientScope,patientId:string){
 parse(z.uuid(),patientId);const c=await context(db,s);
 const [patient]=await db.select({id:patients.id}).from(patients).where(and(eq(patients.clinicId,s.clinicId),eq(patients.id,patientId)));
 if(!patient)throw new AppError(404,'PATIENT_NOT_FOUND','Patient not available in this clinic.');
 // clock_timestamp, not now(): several views inside one transaction must still order correctly.
 await db.insert(recentPatients).values({clinicId:s.clinicId,membershipId:c.membershipId,patientId,viewedAt:sql`clock_timestamp()`}).onConflictDoUpdate({target:[recentPatients.membershipId,recentPatients.patientId],set:{viewedAt:sql`clock_timestamp()`}});
 return {recorded:true};
}
// Only the caller's own list, demographic fields only, re-checked against current access on every read.
export async function listRecentPatients(db:Database,s:PatientScope){
 const c=await context(db,s);
 return db.select({id:patients.id,name:patients.name,phone:patients.phone,viewedAt:recentPatients.viewedAt,status:sql<string>`coalesce((select pr.body->>'status' from clinic_app.patient_profiles pr where pr.patient_id=${patients.id} and pr.clinic_id=${patients.clinicId}),'active')`})
  .from(recentPatients).innerJoin(patients,and(eq(patients.id,recentPatients.patientId),eq(patients.clinicId,recentPatients.clinicId)))
  .where(and(eq(recentPatients.clinicId,s.clinicId),eq(recentPatients.membershipId,c.membershipId))).orderBy(desc(recentPatients.viewedAt)).limit(10);
}

import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, gt, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { authorize, resolveContext, type Database } from '../auth/context.ts';
import { appointments } from '../db/schema/appointments.ts';
import { patients } from '../db/schema/patients.ts';
import { auditEvents } from '../db/schema/security.ts';
import { AppError } from '../http/errors.ts';
import type { PatientScope } from '../patients/service.ts';
const scopeSchema = z.object({ authUserId:z.uuid(),clinicId:z.uuid(),branchId:z.uuid() });
const instant = z.iso.datetime({ offset:true }).transform(v => new Date(v));
const windowSchema = z.object({ startsAt:instant, endsAt:instant }).refine(v => v.endsAt > v.startsAt && +v.endsAt - +v.startsAt <= 31*24*60*60*1000, 'Select a range of up to 31 days.');
const bookingSchema = z.object({ patientId:z.uuid(),operationId:z.uuid(),startsAt:instant,endsAt:instant }).strict().refine(v => +v.endsAt - +v.startsAt >= 60000 && +v.endsAt - +v.startsAt <= 8*60*60*1000);
const fields = { id:appointments.id,patientId:appointments.patientId,startsAt:appointments.startsAt,endsAt:appointments.endsAt,status:appointments.status,version:appointments.version };
function parse<T>(schema:z.ZodType<T>,value:unknown):T { const result=schema.safeParse(value); if(!result.success) throw new AppError(400,'INVALID_INPUT','Check patient, time range and appointment details.'); return result.data; }
async function context(db:Database,raw:PatientScope,write=false) { const s=parse(scopeSchema,raw); const c=await resolveContext(db,s.authUserId,s.clinicId,s.branchId); authorize(c,write?'appointment.write':'appointment.read'); authorize(c,'patient.demographics.read'); return c; }
const scoped = (scope:PatientScope) => and(eq(appointments.clinicId,scope.clinicId),eq(appointments.branchId,scope.branchId));
async function lock(db:Database,scope:PatientScope) {
  // All branch calendar mutations serialize, so concurrent overlapping requests cannot both pass.
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${scope.clinicId + ':' + scope.branchId}, 0))`);
}
async function audit(db:Database,scope:PatientScope,membershipId:string,id:string,action:string) {
  await db.insert(auditEvents).values({ clinicId:scope.clinicId,branchId:scope.branchId,actorMembershipId:membershipId,entityId:id,entityType:'appointment',action,requestId:randomUUID() });
}
export async function listAppointments(db:Database,scope:PatientScope,raw:unknown) {
  const range=parse(windowSchema,raw); await context(db,scope);
  return db.select({ ...fields,patientName:patients.name }).from(appointments).innerJoin(patients,and(eq(patients.id,appointments.patientId),eq(patients.clinicId,appointments.clinicId))).where(and(scoped(scope),lt(appointments.startsAt,range.endsAt),gt(appointments.endsAt,range.startsAt))).orderBy(asc(appointments.startsAt),asc(appointments.id)).limit(200);
}
export async function bookAppointment(db:Database,scope:PatientScope,raw:unknown) {
  const input=parse(bookingSchema,raw);
  const hash=createHash('sha256').update(JSON.stringify({ patientId:input.patientId,startsAt:input.startsAt.toISOString(),endsAt:input.endsAt.toISOString() })).digest('hex');
  return db.transaction(async tx => {
    const c=await context(tx,scope,true); await lock(tx,scope);
    const [existing]=await tx.select().from(appointments).where(and(scoped(scope),eq(appointments.operationId,input.operationId)));
    if(existing) { if(existing.payloadHash!==hash) throw new AppError(409,'OPERATION_CONFLICT','This booking key has different details.'); return { id:existing.id,patientId:existing.patientId,startsAt:existing.startsAt,endsAt:existing.endsAt,status:existing.status,version:existing.version }; }
    const [patient]=await tx.select({id:patients.id}).from(patients).where(and(eq(patients.id,input.patientId),eq(patients.clinicId,scope.clinicId)));
    if(!patient) throw new AppError(404,'PATIENT_NOT_FOUND','Patient not available in this clinic.');
    const [overlap]=await tx.select({id:appointments.id}).from(appointments).where(and(scoped(scope),ne(appointments.status,'cancelled'),lt(appointments.startsAt,input.endsAt),gt(appointments.endsAt,input.startsAt))).limit(1);
    if(overlap) throw new AppError(409,'SLOT_CONFLICT','This branch calendar already has a booking at that time.');
    const [row]=await tx.insert(appointments).values({ ...input,clinicId:scope.clinicId,branchId:scope.branchId,payloadHash:hash }).returning(fields);
    await audit(tx,scope,c.membershipId,row.id,'appointment.booked'); return row;
  });
}
export async function changeAppointmentStatus(db:Database,scope:PatientScope,id:string,raw:unknown) {
  parse(z.uuid(),id); const input=parse(z.object({ expectedVersion:z.number().int().positive(),status:z.enum(['arrived','cancelled']) }).strict(),raw);
  return db.transaction(async tx => {
    const c=await context(tx,scope,true); await lock(tx,scope);
    const [row]=await tx.update(appointments).set({status:input.status,version:sql`${appointments.version}+1`}).where(and(scoped(scope),eq(appointments.id,id),eq(appointments.version,input.expectedVersion),eq(appointments.status,'booked'))).returning(fields);
    if(!row) throw new AppError(409,'APPOINTMENT_CONFLICT','Appointment changed or is no longer booked. Refresh the calendar.');
    await audit(tx,scope,c.membershipId,id,`appointment.${input.status}`); return row;
  });
}

import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, gt, inArray, isNull, lt, ne, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { appointmentQuery, bookingInput, canTransition, detailsInput, occupyingStatuses, reschedulableStatuses, rescheduleInput, statusInput, statusLabels, transitionNeedsNote, walkInInput, type AppointmentEventDetail, type AppointmentStatus } from '../../lib/appointments/contracts.ts';
import { localParts, openingCheck } from '../../lib/scheduling/contracts.ts';
import { authorize, resolveContext, type Database, type StaffContext } from '../auth/context.ts';
import { appointmentEvents, appointments } from '../db/schema/appointments.ts';
import { appUsers, memberships } from '../db/schema/organization.ts';
import { patients } from '../db/schema/patients.ts';
import { procedures } from '../db/schema/procedures.ts';
import { scheduleChairs, scheduleDentists } from '../db/schema/scheduling.ts';
import { auditEvents } from '../db/schema/security.ts';
import { AppError } from '../http/errors.ts';
import { openingRules } from '../scheduling/settings.ts';
import type { PatientScope } from '../patients/service.ts';
const scopeSchema = z.object({ authUserId:z.uuid(),clinicId:z.uuid(),branchId:z.uuid() });
const fields = { id:appointments.id,patientId:appointments.patientId,startsAt:appointments.startsAt,endsAt:appointments.endsAt,status:appointments.status,version:appointments.version,dentistId:appointments.dentistId,chairId:appointments.chairId,procedureId:appointments.procedureId,reason:appointments.reason,notes:appointments.notes,nextAction:appointments.nextAction,source:appointments.source,overrideReason:appointments.overrideReason };
type Row = { id:string;patientId:string;startsAt:Date;endsAt:Date;status:string;version:number;dentistId:string|null;chairId:string|null;procedureId:string|null };
function parse<T>(schema:z.ZodType<T>,value:unknown):T { const result=schema.safeParse(value); if(!result.success) throw new AppError(400,'INVALID_INPUT','Check patient, time range and appointment details.'); return result.data; }
const hash = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function context(db:Database,raw:PatientScope,write=false) { const s=parse(scopeSchema,raw); const c=await resolveContext(db,s.authUserId,s.clinicId,s.branchId); authorize(c,write?'appointment.write':'appointment.read'); authorize(c,'patient.demographics.read'); return c; }
const scoped = (scope:PatientScope) => and(eq(appointments.clinicId,scope.clinicId),eq(appointments.branchId,scope.branchId));
async function lock(db:Database,scope:{clinicId:string;branchId:string}) {
  // All branch calendar mutations serialize, so concurrent overlapping requests cannot both pass.
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${scope.clinicId + ':' + scope.branchId}, 0))`);
}
async function record(db:Database,scope:{clinicId:string;branchId:string},actor:string,id:string,version:number,kind:string,from:string|null,to:string,detail:AppointmentEventDetail,operationId:string,digest:string,action:string) {
  await db.insert(appointmentEvents).values({ clinicId:scope.clinicId,branchId:scope.branchId,appointmentId:id,version,kind,fromStatus:from,toStatus:to,detail,actorMembershipId:actor,operationId,payloadHash:digest });
  await db.insert(auditEvents).values({ clinicId:scope.clinicId,branchId:scope.branchId,actorMembershipId:actor,entityId:id,entityType:'appointment',action:`appointment.${action}`,requestId:randomUUID() });
}
// Later commands are idempotent through their recorded event; a replay returns the appointment's current state.
async function replay(db:Database,scope:PatientScope,operationId:string,digest:string) {
  const [event]=await db.select({appointmentId:appointmentEvents.appointmentId,payloadHash:appointmentEvents.payloadHash}).from(appointmentEvents).where(and(eq(appointmentEvents.clinicId,scope.clinicId),eq(appointmentEvents.branchId,scope.branchId),eq(appointmentEvents.operationId,operationId)));
  if(!event) return null; if(event.payloadHash!==digest) throw new AppError(409,'OPERATION_CONFLICT','This appointment request key has different details.');
  const [row]=await db.select(fields).from(appointments).where(eq(appointments.id,event.appointmentId)); return row;
}
async function bookingReplay(db:Database,scope:PatientScope,operationId:string,digest:string) {
  const [existing]=await db.select({ id:appointments.id,payloadHash:appointments.payloadHash }).from(appointments).where(and(scoped(scope),eq(appointments.operationId,operationId)));
  if(!existing) return null; if(existing.payloadHash!==digest) throw new AppError(409,'OPERATION_CONFLICT','This booking key has different details.');
  const [row]=await db.select(fields).from(appointments).where(eq(appointments.id,existing.id)); return row;
}
async function locked(db:Database,scope:PatientScope,id:string,expectedVersion:number) {
  const [row]=await db.select(fields).from(appointments).where(and(scoped(scope),eq(appointments.id,id))).for('update');
  if(!row) throw new AppError(404,'APPOINTMENT_NOT_FOUND','Appointment is not available in this branch.');
  if(row.version!==expectedVersion) throw new AppError(409,'APPOINTMENT_CONFLICT','Appointment changed. Refresh the calendar.');
  return row;
}
async function requirePatient(db:Database,scope:PatientScope,patientId:string) {
  const [patient]=await db.select({id:patients.id}).from(patients).where(and(eq(patients.id,patientId),eq(patients.clinicId,scope.clinicId)));
  if(!patient) throw new AppError(404,'PATIENT_NOT_FOUND','Patient not available in this clinic.');
}
// Once a branch has dentist calendars, every booking names its dentist.
async function requireResources(db:Database,scope:PatientScope,dentistId:string|null,chairId:string|null) {
  if(dentistId) { const [d]=await db.select({id:scheduleDentists.id}).from(scheduleDentists).where(and(eq(scheduleDentists.clinicId,scope.clinicId),eq(scheduleDentists.branchId,scope.branchId),eq(scheduleDentists.id,dentistId),eq(scheduleDentists.active,true))); if(!d) throw new AppError(404,'DENTIST_UNAVAILABLE','Choose an active dentist in this branch.'); }
  else { const [any]=await db.select({id:scheduleDentists.id}).from(scheduleDentists).where(and(eq(scheduleDentists.clinicId,scope.clinicId),eq(scheduleDentists.branchId,scope.branchId),eq(scheduleDentists.active,true))).limit(1); if(any) throw new AppError(400,'DENTIST_REQUIRED','Choose the dentist for this booking.'); }
  if(chairId) { const [chair]=await db.select({id:scheduleChairs.id}).from(scheduleChairs).where(and(eq(scheduleChairs.clinicId,scope.clinicId),eq(scheduleChairs.branchId,scope.branchId),eq(scheduleChairs.id,chairId),eq(scheduleChairs.active,true))); if(!chair) throw new AppError(404,'CHAIR_UNAVAILABLE','Choose an active chair in this branch.'); }
}
async function procedureDefault(db:Database,scope:PatientScope,procedureId:string|null,mustBeActive:boolean) {
  if(!procedureId) return null;
  const [row]=await db.select({defaultMinutes:procedures.defaultMinutes,active:procedures.active}).from(procedures).where(and(eq(procedures.clinicId,scope.clinicId),eq(procedures.id,procedureId)));
  if(!row||(mustBeActive&&!row.active)) throw new AppError(404,'PROCEDURE_NOT_FOUND','Choose an active procedure from the catalog.');
  return row.defaultMinutes;
}
// A duration different from the procedure default is a controlled change.
function durationOverride(c:StaffContext,defaultMinutes:number|null,minutes:number) {
  if(defaultMinutes===null||defaultMinutes===minutes) return false;
  if(!c.permissions.has('appointment.duration.override')) throw new AppError(403,'DURATION_OVERRIDE_FORBIDDEN',`Use the procedure's default duration of ${defaultMinutes} minutes, or ask staff with duration override access.`);
  return true;
}
type Slot={ patientId:string;startsAt:Date;endsAt:Date;dentistId:string|null;chairId:string|null;excludeId?:string };
// Returns every reason this slot cannot be booked without an override. Checked under the branch calendar lock.
async function slotProblems(db:Database,scope:PatientScope,slot:Slot) {
  const start=localParts('UTC',slot.startsAt).date; const end=localParts('UTC',slot.endsAt).date;
  const day=(d:string,offset:number)=>new Date(Date.parse(d)+offset*86400000).toISOString().slice(0,10);
  const rules=await openingRules(db,scope,day(start,-1),day(end,1));
  const time=(d:Date)=>new Intl.DateTimeFormat('en-GB',{timeZone:rules.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);
  const overlapping=(extra:SQL|undefined)=>db.select({startsAt:appointments.startsAt,endsAt:appointments.endsAt}).from(appointments).where(and(scoped(scope),inArray(appointments.status,[...occupyingStatuses]),lt(appointments.startsAt,slot.endsAt),gt(appointments.endsAt,slot.startsAt),slot.excludeId?ne(appointments.id,slot.excludeId):undefined,extra)).orderBy(asc(appointments.startsAt)).limit(1);
  const problems:string[]=[]; const describe=(r:{startsAt:Date;endsAt:Date})=>`${time(r.startsAt)}–${time(r.endsAt)}`;
  const [dentist]=await overlapping(slot.dentistId?eq(appointments.dentistId,slot.dentistId):isNull(appointments.dentistId));
  if(dentist) problems.push(slot.dentistId?`The dentist already has a booking at ${describe(dentist)}.`:`The branch calendar already has a booking at ${describe(dentist)}.`);
  if(slot.chairId) { const [chair]=await overlapping(eq(appointments.chairId,slot.chairId)); if(chair) problems.push(`The chair is already booked at ${describe(chair)}.`); }
  const [patient]=await overlapping(eq(appointments.patientId,slot.patientId)); if(patient) problems.push(`This patient already has a booking at ${describe(patient)}.`);
  const opening=openingCheck(rules.hours,rules.closedDates,rules.timezone,slot.startsAt,slot.endsAt);
  if(opening==='closed_date') problems.push('The branch is closed on this date.'); else if(opening==='outside_hours') problems.push('This time is outside opening hours.');
  return problems;
}
function settle(c:StaffContext,problems:string[],override:{reason:string}|null) {
  if(!problems.length) return null;
  if(!override) throw new AppError(409,'SLOT_CONFLICT',problems.join(' '));
  if(!c.permissions.has('appointment.override')) throw new AppError(403,'OVERRIDE_FORBIDDEN',`${problems.join(' ')} Overriding requires appointment override access.`);
  return override.reason;
}
const minutes=(start:Date,end:Date)=>Math.round((+end-+start)/60000);
export async function listAppointments(db:Database,scope:PatientScope,raw:unknown) {
  const range=parse(appointmentQuery,raw); await context(db,scope);
  return db.select({ ...fields,patientName:patients.name,patientDisplayId:patients.displayId,dentistName:scheduleDentists.name,dentistColor:scheduleDentists.color,chairName:scheduleChairs.name,procedureName:procedures.name })
    .from(appointments).innerJoin(patients,and(eq(patients.id,appointments.patientId),eq(patients.clinicId,appointments.clinicId)))
    .leftJoin(scheduleDentists,and(eq(scheduleDentists.id,appointments.dentistId),eq(scheduleDentists.clinicId,appointments.clinicId)))
    .leftJoin(scheduleChairs,and(eq(scheduleChairs.id,appointments.chairId),eq(scheduleChairs.clinicId,appointments.clinicId)))
    .leftJoin(procedures,and(eq(procedures.id,appointments.procedureId),eq(procedures.clinicId,appointments.clinicId)))
    .where(and(scoped(scope),lt(appointments.startsAt,range.endsAt),gt(appointments.endsAt,range.startsAt),range.dentistId?eq(appointments.dentistId,range.dentistId):undefined,range.patientId?eq(appointments.patientId,range.patientId):undefined))
    .orderBy(asc(appointments.startsAt),asc(appointments.id)).limit(500);
}
export async function appointmentHistory(db:Database,scope:PatientScope,id:string) {
  parse(z.uuid(),id); await context(db,scope);
  const [row]=await db.select({id:appointments.id}).from(appointments).where(and(scoped(scope),eq(appointments.id,id)));
  if(!row) throw new AppError(404,'APPOINTMENT_NOT_FOUND','Appointment is not available in this branch.');
  return db.select({ version:appointmentEvents.version,kind:appointmentEvents.kind,fromStatus:appointmentEvents.fromStatus,toStatus:appointmentEvents.toStatus,detail:appointmentEvents.detail,createdAt:appointmentEvents.createdAt,actorName:appUsers.displayName })
    .from(appointmentEvents).innerJoin(memberships,and(eq(memberships.id,appointmentEvents.actorMembershipId),eq(memberships.clinicId,appointmentEvents.clinicId))).innerJoin(appUsers,eq(appUsers.id,memberships.userId))
    .where(and(eq(appointmentEvents.clinicId,scope.clinicId),eq(appointmentEvents.branchId,scope.branchId),eq(appointmentEvents.appointmentId,id))).orderBy(asc(appointmentEvents.version)).limit(200);
}
export async function bookAppointment(db:Database,scope:PatientScope,raw:unknown) {
  const input=parse(bookingInput,raw); const { operationId,...payload }=input; const digest=hash(payload);
  return db.transaction(async tx => {
    const c=await context(tx,scope,true); await lock(tx,scope);
    const old=await bookingReplay(tx,scope,operationId,digest); if(old) return old;
    await requirePatient(tx,scope,input.patientId); await requireResources(tx,scope,input.dentistId,input.chairId);
    const longer=durationOverride(c,await procedureDefault(tx,scope,input.procedureId,true),minutes(input.startsAt,input.endsAt));
    const overrideReason=settle(c,await slotProblems(tx,scope,input),input.override);
    const [row]=await tx.insert(appointments).values({ clinicId:scope.clinicId,branchId:scope.branchId,patientId:input.patientId,startsAt:input.startsAt,endsAt:input.endsAt,dentistId:input.dentistId,chairId:input.chairId,procedureId:input.procedureId,reason:input.reason,notes:input.notes,nextAction:input.nextAction,source:input.source,overrideReason,operationId,payloadHash:digest }).returning(fields);
    await record(tx,scope,c.membershipId,row.id,1,'booked',null,'booked',{ startsAt:input.startsAt.toISOString(),endsAt:input.endsAt.toISOString(),dentistId:input.dentistId,chairId:input.chairId,procedureId:input.procedureId,reason:input.reason,source:input.source,...(overrideReason?{override:overrideReason}:{}),...(longer?{durationOverride:true}:{}) },operationId,digest,'booked');
    return row;
  });
}
// Walk-ins record an arrival now; they queue for the dentist rather than reserve a slot, so slot conflicts and hours are not enforced.
export async function registerWalkIn(db:Database,scope:PatientScope,raw:unknown) {
  const input=parse(walkInInput,raw); const { operationId,...payload }=input; const digest=hash({ action:'walk_in',...payload });
  return db.transaction(async tx => {
    const c=await context(tx,scope,true); await lock(tx,scope);
    const old=await bookingReplay(tx,scope,operationId,digest); if(old) return old;
    await requirePatient(tx,scope,input.patientId); await requireResources(tx,scope,input.dentistId,input.chairId);
    const longer=durationOverride(c,await procedureDefault(tx,scope,input.procedureId,true),input.minutes);
    const startsAt=new Date(Math.floor(Date.now()/60000)*60000); const endsAt=new Date(+startsAt+input.minutes*60000);
    const [row]=await tx.insert(appointments).values({ clinicId:scope.clinicId,branchId:scope.branchId,patientId:input.patientId,startsAt,endsAt,status:'arrived',dentistId:input.dentistId,chairId:input.chairId,procedureId:input.procedureId,reason:input.reason,notes:input.notes,source:'walk_in',operationId,payloadHash:digest }).returning(fields);
    await record(tx,scope,c.membershipId,row.id,1,'walk_in',null,'arrived',{ startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString(),dentistId:input.dentistId,chairId:input.chairId,procedureId:input.procedureId,reason:input.reason,source:'walk_in',...(longer?{durationOverride:true}:{}) },operationId,digest,'walk_in');
    return row;
  });
}
export async function changeAppointmentStatus(db:Database,scope:PatientScope,id:string,raw:unknown) {
  parse(z.uuid(),id); const input=parse(statusInput,raw); const { operationId,...payload }=input; const digest=hash({ id,action:'status',...payload });
  return db.transaction(async tx => {
    const c=await context(tx,scope,true); await lock(tx,scope);
    const old=await replay(tx,scope,operationId,digest); if(old) return old;
    const row=await locked(tx,scope,id,input.expectedVersion); const from=row.status as AppointmentStatus;
    if(!canTransition(from,input.status)) throw new AppError(409,'INVALID_TRANSITION',`A ${statusLabels[from].toLowerCase()} appointment cannot be marked ${statusLabels[input.status].toLowerCase()}.`);
    if(transitionNeedsNote(from,input.status)&&input.note.length<3) throw new AppError(400,'NOTE_REQUIRED','Record a reason for this change.');
    if(input.status==='no_show'&&+row.startsAt>Date.now()) throw new AppError(409,'NOT_STARTED','Mark a no-show only after the appointment start time.');
    const [updated]=await tx.update(appointments).set({ status:input.status,version:row.version+1 }).where(eq(appointments.id,id)).returning(fields);
    await record(tx,scope,c.membershipId,id,row.version+1,'status',from,input.status,input.note?{ note:input.note }:{},operationId,digest,input.status);
    return updated;
  });
}
// Moving a booking keeps its identity and history; the previous slot stays in the event log and confirmation must be repeated.
export async function rescheduleAppointment(db:Database,scope:PatientScope,id:string,raw:unknown) {
  parse(z.uuid(),id); const input=parse(rescheduleInput,raw); const { operationId,...payload }=input; const digest=hash({ id,action:'reschedule',...payload });
  return db.transaction(async tx => {
    const c=await context(tx,scope,true); await lock(tx,scope);
    const old=await replay(tx,scope,operationId,digest); if(old) return old;
    const row=await locked(tx,scope,id,input.expectedVersion);
    if(!(reschedulableStatuses as readonly string[]).includes(row.status)) throw new AppError(409,'NOT_RESCHEDULABLE','Only booked or confirmed appointments can be moved.');
    if(+row.startsAt===+input.startsAt&&+row.endsAt===+input.endsAt&&row.dentistId===input.dentistId&&row.chairId===input.chairId) throw new AppError(400,'NO_CHANGE','Choose a different time, dentist or chair.');
    await requireResources(tx,scope,input.dentistId,input.chairId);
    const length=minutes(input.startsAt,input.endsAt); const longer=length!==minutes(row.startsAt,row.endsAt)&&durationOverride(c,await procedureDefault(tx,scope,row.procedureId,false),length);
    const overrideReason=settle(c,await slotProblems(tx,scope,{ ...input,patientId:row.patientId,excludeId:id }),input.override);
    const [updated]=await tx.update(appointments).set({ startsAt:input.startsAt,endsAt:input.endsAt,dentistId:input.dentistId,chairId:input.chairId,overrideReason,status:'booked',version:row.version+1 }).where(eq(appointments.id,id)).returning(fields);
    await record(tx,scope,c.membershipId,id,row.version+1,'rescheduled',row.status,'booked',{ previousStartsAt:row.startsAt.toISOString(),previousEndsAt:row.endsAt.toISOString(),startsAt:input.startsAt.toISOString(),endsAt:input.endsAt.toISOString(),previousDentistId:row.dentistId,dentistId:input.dentistId,previousChairId:row.chairId,chairId:input.chairId,...(input.note?{note:input.note}:{}),...(overrideReason?{override:overrideReason}:{}),...(longer?{durationOverride:true}:{}) },operationId,digest,'rescheduled');
    return updated;
  });
}
export async function updateAppointmentDetails(db:Database,scope:PatientScope,id:string,raw:unknown) {
  parse(z.uuid(),id); const input=parse(detailsInput,raw); const { operationId,...payload }=input; const digest=hash({ id,action:'details',...payload });
  return db.transaction(async tx => {
    const c=await context(tx,scope,true); await lock(tx,scope);
    const old=await replay(tx,scope,operationId,digest); if(old) return old;
    const row=await locked(tx,scope,id,input.expectedVersion);
    if(input.procedureId!==row.procedureId) await procedureDefault(tx,scope,input.procedureId,true);
    const [updated]=await tx.update(appointments).set({ procedureId:input.procedureId,reason:input.reason,notes:input.notes,nextAction:input.nextAction,version:row.version+1 }).where(eq(appointments.id,id)).returning(fields);
    await record(tx,scope,c.membershipId,id,row.version+1,'details',row.status,row.status,{ procedureId:input.procedureId,reason:input.reason,notes:input.notes,nextAction:input.nextAction },operationId,digest,'details_updated');
    return updated;
  });
}
// Called inside the visit-creation transaction: starting the clinical visit moves an arrived/waiting appointment into treatment.
export async function startTreatmentForVisit(db:Database,scope:{clinicId:string;branchId:string},actorMembershipId:string,appointment:Row,operationId:string,visitId:string) {
  if(appointment.status==='in_treatment') return;
  await lock(db,scope);
  const [updated]=await db.update(appointments).set({ status:'in_treatment',version:appointment.version+1 }).where(and(eq(appointments.id,appointment.id),eq(appointments.version,appointment.version))).returning({ id:appointments.id });
  if(!updated) throw new AppError(409,'APPOINTMENT_CONFLICT','Appointment changed. Refresh the calendar and start the visit again.');
  await record(db,scope,actorMembershipId,appointment.id,appointment.version+1,'status',appointment.status,'in_treatment',{ visitId,note:'Clinical visit started' },operationId,hash({ visitId,action:'visit_start' }),'in_treatment');
}

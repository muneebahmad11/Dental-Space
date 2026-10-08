import { createHash,randomUUID } from 'node:crypto';
import { and,asc,desc,eq,gte,sql } from 'drizzle-orm';
import { z } from 'zod';
import { closureCancelInput,closureInput,createResourceInput,hoursInput,updateResourceInput,type WeeklyHours } from '../../lib/scheduling/contracts.ts';
import { businessDate } from '../../lib/finance/contracts.ts';
import { authorize,resolveContext,type Database } from '../auth/context.ts';
import { appUsers,clinics,memberships,membershipBranches } from '../db/schema/organization.ts';
import { branchClosures,branchScheduleSettings,scheduleChairs,scheduleConfigRevisions,scheduleDentists } from '../db/schema/scheduling.ts';
import { auditEvents } from '../db/schema/security.ts';
import { AppError } from '../http/errors.ts';
import type { PatientScope } from '../patients/service.ts';
type EntityType='dentist'|'chair'|'hours'|'closure';
const parse=<T>(schema:z.ZodType<T>,value:unknown):T=>{const r=schema.safeParse(value);if(!r.success)throw new AppError(400,'INVALID_INPUT','Check the schedule setup details.');return r.data;};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function context(db:Database,s:PatientScope,write=false){
 parse(z.object({authUserId:z.uuid(),clinicId:z.uuid(),branchId:z.uuid()}),s);const c=await resolveContext(db,s.authUserId,s.clinicId,s.branchId);
 if(write)authorize(c,'schedule.configure');else if(!c.permissions.has('appointment.read')&&!c.permissions.has('schedule.configure'))authorize(c,'appointment.read');
 return c;
}
// Configuration commands for one branch serialize, so name/date uniqueness checks and versions cannot race.
async function lock(db:Database,s:PatientScope){await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${s.clinicId+':'+s.branchId+':schedule-config'},0))`);}
async function replay(db:Database,s:PatientScope,operationId:string,digest:string){
 const [row]=await db.select().from(scheduleConfigRevisions).where(and(eq(scheduleConfigRevisions.clinicId,s.clinicId),eq(scheduleConfigRevisions.branchId,s.branchId),eq(scheduleConfigRevisions.operationId,operationId)));
 if(row&&row.payloadHash!==digest)throw new AppError(409,'OPERATION_CONFLICT','This operation key has different schedule details.');
 return row?{id:row.entityId,version:row.version}:null;
}
async function record(db:Database,s:PatientScope,actor:string,entityType:EntityType,entityId:string,version:number,snapshot:unknown,operationId:string,digest:string,action:string){
 await db.insert(scheduleConfigRevisions).values({clinicId:s.clinicId,branchId:s.branchId,entityType,entityId,version,snapshot,actorMembershipId:actor,operationId,payloadHash:digest});
 await db.insert(auditEvents).values({clinicId:s.clinicId,branchId:s.branchId,actorMembershipId:actor,entityId,entityType:`schedule_${entityType}`,action:`schedule.${entityType}.${action}`,requestId:randomUUID()});
}
async function nameFree(db:Database,s:PatientScope,kind:'dentist'|'chair',name:string,exceptId?:string){
 const table=kind==='dentist'?scheduleDentists:scheduleChairs;
 const rows=await db.execute(sql`select 1 from ${table} where clinic_id=${s.clinicId} and branch_id=${s.branchId} and lower(name)=lower(${name}) ${exceptId?sql`and id<>${exceptId}`:sql``} limit 1`);
 if(rows.length)throw new AppError(409,'NAME_EXISTS',`A ${kind} with this name already exists in this branch.`);
}
async function linkableMember(db:Database,s:PatientScope,membershipId:string|null,exceptDentistId?:string){
 if(!membershipId)return;
 const [row]=await db.select({id:memberships.id}).from(memberships).innerJoin(appUsers,eq(appUsers.id,memberships.userId)).innerJoin(membershipBranches,and(eq(membershipBranches.membershipId,memberships.id),eq(membershipBranches.clinicId,memberships.clinicId))).where(and(eq(memberships.id,membershipId),eq(memberships.clinicId,s.clinicId),eq(memberships.active,true),eq(appUsers.active,true),eq(membershipBranches.branchId,s.branchId)));
 if(!row)throw new AppError(400,'STAFF_UNAVAILABLE','Choose active staff assigned to this branch.');
 const [taken]=await db.select({id:scheduleDentists.id}).from(scheduleDentists).where(and(eq(scheduleDentists.clinicId,s.clinicId),eq(scheduleDentists.branchId,s.branchId),eq(scheduleDentists.membershipId,membershipId)));
 if(taken&&taken.id!==exceptDentistId)throw new AppError(409,'STAFF_ALREADY_LINKED','This staff member is already linked to another dentist calendar.');
}
async function branchStaff(db:Database,s:PatientScope){
 return db.select({id:memberships.id,name:appUsers.displayName}).from(memberships).innerJoin(appUsers,eq(appUsers.id,memberships.userId)).innerJoin(membershipBranches,and(eq(membershipBranches.membershipId,memberships.id),eq(membershipBranches.clinicId,memberships.clinicId))).where(and(eq(memberships.clinicId,s.clinicId),eq(membershipBranches.branchId,s.branchId),eq(memberships.active,true),eq(appUsers.active,true))).orderBy(asc(appUsers.displayName),asc(memberships.id)).limit(200);
}
async function timezoneOf(db:Database,clinicId:string){const [clinic]=await db.select({timezone:clinics.timezone}).from(clinics).where(eq(clinics.id,clinicId));return clinic.timezone;}
// Bookings that would fall on a newly closed date are reported, never silently cancelled.
async function bookingsOn(db:Database,s:PatientScope,timezone:string,day:string){
 const [row]=await db.execute<{count:number}>(sql`select count(*)::int as count from clinic_app.appointments where clinic_id=${s.clinicId} and branch_id=${s.branchId} and status<>'cancelled' and (starts_at at time zone ${timezone})::date=${day}::date`);
 return row.count;
}
export async function getScheduleSettings(db:Database,s:PatientScope){
 return db.transaction(async tx=>{
  const c=await context(tx,s);const timezone=await timezoneOf(tx,s.clinicId);const today=businessDate(timezone);
  const scoped=<T extends typeof scheduleDentists|typeof scheduleChairs>(t:T)=>and(eq(t.clinicId,s.clinicId),eq(t.branchId,s.branchId));
  const dentists=await tx.select({id:scheduleDentists.id,name:scheduleDentists.name,color:scheduleDentists.color,membershipId:scheduleDentists.membershipId,active:scheduleDentists.active,version:scheduleDentists.version}).from(scheduleDentists).where(scoped(scheduleDentists)).orderBy(desc(scheduleDentists.active),asc(scheduleDentists.name));
  const chairs=await tx.select({id:scheduleChairs.id,name:scheduleChairs.name,active:scheduleChairs.active,version:scheduleChairs.version}).from(scheduleChairs).where(scoped(scheduleChairs)).orderBy(desc(scheduleChairs.active),asc(scheduleChairs.name));
  const [settings]=await tx.select().from(branchScheduleSettings).where(and(eq(branchScheduleSettings.clinicId,s.clinicId),eq(branchScheduleSettings.branchId,s.branchId)));
  const closures=await tx.select({id:branchClosures.id,closedOn:branchClosures.closedOn,reason:branchClosures.reason,version:branchClosures.version}).from(branchClosures).where(and(eq(branchClosures.clinicId,s.clinicId),eq(branchClosures.branchId,s.branchId),eq(branchClosures.active,true),gte(branchClosures.closedOn,today))).orderBy(asc(branchClosures.closedOn)).limit(100);
  const canConfigure=c.permissions.has('schedule.configure');
  return {timezone,today,canConfigure,dentists,chairs,hours:settings?{slotMinutes:settings.slotMinutes,weeklyHours:settings.weeklyHours,version:settings.version}:null,closures,staff:canConfigure?await branchStaff(tx,s):[]};
 },{isolationLevel:'repeatable read'});
}
export async function createScheduleResource(db:Database,s:PatientScope,raw:unknown){
 const input=parse(createResourceInput,raw);const digest=hash({action:'create',...input});
 return db.transaction(async tx=>{
  const c=await context(tx,s,true);await lock(tx,s);const old=await replay(tx,s,input.operationId,digest);if(old)return old;
  await nameFree(tx,s,input.kind,input.name);
  if(input.kind==='dentist'){
   await linkableMember(tx,s,input.membershipId);
   const [row]=await tx.insert(scheduleDentists).values({clinicId:s.clinicId,branchId:s.branchId,name:input.name,color:input.color,membershipId:input.membershipId}).returning();
   await record(tx,s,c.membershipId,'dentist',row.id,1,{name:row.name,color:row.color,membershipId:row.membershipId,active:true},input.operationId,digest,'created');return {id:row.id,version:1};
  }
  const [row]=await tx.insert(scheduleChairs).values({clinicId:s.clinicId,branchId:s.branchId,name:input.name}).returning();
  await record(tx,s,c.membershipId,'chair',row.id,1,{name:row.name,active:true},input.operationId,digest,'created');return {id:row.id,version:1};
 });
}
export async function updateScheduleResource(db:Database,s:PatientScope,id:string,raw:unknown){
 parse(z.uuid(),id);const input=parse(updateResourceInput,raw);const digest=hash({action:'update',id,...input});
 return db.transaction(async tx=>{
  const c=await context(tx,s,true);await lock(tx,s);const old=await replay(tx,s,input.operationId,digest);if(old)return old;
  const conflict=()=>new AppError(409,'RESOURCE_CONFLICT','This schedule resource changed. Reload before saving.');
  const action=(was:boolean)=>was===input.active?'updated':input.active?'reactivated':'deactivated';
  if(input.kind==='dentist'){
   const [row]=await tx.select().from(scheduleDentists).where(and(eq(scheduleDentists.clinicId,s.clinicId),eq(scheduleDentists.branchId,s.branchId),eq(scheduleDentists.id,id))).for('update');
   if(!row)throw new AppError(404,'RESOURCE_NOT_FOUND','Dentist calendar is not available in this branch.');if(row.version!==input.expectedVersion)throw conflict();
   await nameFree(tx,s,'dentist',input.name,id);if(input.membershipId!==row.membershipId)await linkableMember(tx,s,input.membershipId,id);
   await tx.update(scheduleDentists).set({name:input.name,color:input.color,membershipId:input.membershipId,active:input.active,version:row.version+1}).where(eq(scheduleDentists.id,id));
   await record(tx,s,c.membershipId,'dentist',id,row.version+1,{name:input.name,color:input.color,membershipId:input.membershipId,active:input.active},input.operationId,digest,action(row.active));return {id,version:row.version+1};
  }
  const [row]=await tx.select().from(scheduleChairs).where(and(eq(scheduleChairs.clinicId,s.clinicId),eq(scheduleChairs.branchId,s.branchId),eq(scheduleChairs.id,id))).for('update');
  if(!row)throw new AppError(404,'RESOURCE_NOT_FOUND','Chair is not available in this branch.');if(row.version!==input.expectedVersion)throw conflict();
  await nameFree(tx,s,'chair',input.name,id);
  await tx.update(scheduleChairs).set({name:input.name,active:input.active,version:row.version+1}).where(eq(scheduleChairs.id,id));
  await record(tx,s,c.membershipId,'chair',id,row.version+1,{name:input.name,active:input.active},input.operationId,digest,action(row.active));return {id,version:row.version+1};
 });
}
export async function saveOpeningHours(db:Database,s:PatientScope,raw:unknown){
 const input=parse(hoursInput,raw);const digest=hash({action:'hours',...input});
 return db.transaction(async tx=>{
  const c=await context(tx,s,true);await lock(tx,s);const old=await replay(tx,s,input.operationId,digest);if(old)return old;
  const [current]=await tx.select().from(branchScheduleSettings).where(and(eq(branchScheduleSettings.clinicId,s.clinicId),eq(branchScheduleSettings.branchId,s.branchId))).for('update');
  const version=current?.version??0;if(version!==input.expectedVersion)throw new AppError(409,'HOURS_CONFLICT','Opening hours changed. Reload before saving.');
  const values={slotMinutes:input.slotMinutes,weeklyHours:input.weeklyHours as WeeklyHours,version:version+1,updatedAt:new Date()};
  if(current)await tx.update(branchScheduleSettings).set(values).where(and(eq(branchScheduleSettings.clinicId,s.clinicId),eq(branchScheduleSettings.branchId,s.branchId)));
  else await tx.insert(branchScheduleSettings).values({clinicId:s.clinicId,branchId:s.branchId,...values});
  await record(tx,s,c.membershipId,'hours',s.branchId,version+1,{slotMinutes:input.slotMinutes,weeklyHours:input.weeklyHours},input.operationId,digest,'saved');return {id:s.branchId,version:version+1};
 });
}
export async function addClosure(db:Database,s:PatientScope,raw:unknown){
 const input=parse(closureInput,raw);const digest=hash({action:'closure',...input});
 return db.transaction(async tx=>{
  const c=await context(tx,s,true);await lock(tx,s);const timezone=await timezoneOf(tx,s.clinicId);
  const old=await replay(tx,s,input.operationId,digest);if(old)return {...old,existingBookings:await bookingsOn(tx,s,timezone,input.closedOn)};
  if(input.closedOn<businessDate(timezone))throw new AppError(400,'CLOSURE_IN_PAST','Closed dates must be today or later.');
  const [existing]=await tx.select({id:branchClosures.id}).from(branchClosures).where(and(eq(branchClosures.clinicId,s.clinicId),eq(branchClosures.branchId,s.branchId),eq(branchClosures.closedOn,input.closedOn),eq(branchClosures.active,true)));
  if(existing)throw new AppError(409,'CLOSURE_EXISTS','This date is already marked closed.');
  const [row]=await tx.insert(branchClosures).values({clinicId:s.clinicId,branchId:s.branchId,closedOn:input.closedOn,reason:input.reason}).returning();
  await record(tx,s,c.membershipId,'closure',row.id,1,{closedOn:row.closedOn,reason:row.reason,active:true},input.operationId,digest,'created');
  return {id:row.id,version:1,existingBookings:await bookingsOn(tx,s,timezone,input.closedOn)};
 });
}
export async function cancelClosure(db:Database,s:PatientScope,id:string,raw:unknown){
 parse(z.uuid(),id);const input=parse(closureCancelInput,raw);const digest=hash({action:'reopen',id,...input});
 return db.transaction(async tx=>{
  const c=await context(tx,s,true);await lock(tx,s);const old=await replay(tx,s,input.operationId,digest);if(old)return old;
  const [row]=await tx.select().from(branchClosures).where(and(eq(branchClosures.clinicId,s.clinicId),eq(branchClosures.branchId,s.branchId),eq(branchClosures.id,id))).for('update');
  if(!row)throw new AppError(404,'CLOSURE_NOT_FOUND','Closed date is not available in this branch.');
  if(row.version!==input.expectedVersion||!row.active)throw new AppError(409,'CLOSURE_CONFLICT','This closed date changed. Reload before saving.');
  await tx.update(branchClosures).set({active:false,version:row.version+1}).where(eq(branchClosures.id,id));
  await record(tx,s,c.membershipId,'closure',id,row.version+1,{closedOn:row.closedOn,reason:row.reason,active:false},input.operationId,digest,'cancelled');return {id,version:row.version+1};
 });
}
// Rules used by booking commands inside their own transaction.
export async function openingRules(db:Database,s:{clinicId:string;branchId:string},from:string,to:string){
 const timezone=await timezoneOf(db,s.clinicId);
 const [settings]=await db.select({weeklyHours:branchScheduleSettings.weeklyHours}).from(branchScheduleSettings).where(and(eq(branchScheduleSettings.clinicId,s.clinicId),eq(branchScheduleSettings.branchId,s.branchId)));
 const closed=await db.execute<{day:string}>(sql`select closed_on::text as day from clinic_app.branch_closures where clinic_id=${s.clinicId} and branch_id=${s.branchId} and active and closed_on between ${from}::date and ${to}::date`);
 return {timezone,hours:settings?.weeklyHours??null,closedDates:new Set(closed.map(r=>r.day))};
}

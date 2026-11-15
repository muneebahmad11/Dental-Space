import { and,count,eq,gt,lt,sql } from 'drizzle-orm';
import { z } from 'zod';
import { authorize,resolveContext,type Database } from '../auth/context.ts';
import { patients } from '../db/schema/patients.ts';
import { appointments } from '../db/schema/appointments.ts';
import { clinics } from '../db/schema/organization.ts';
import { appointmentStatuses,type AppointmentStatus } from '../../lib/appointments/contracts.ts';
import type { PatientScope } from '../patients/service.ts';
import { AppError } from '../http/errors.ts';
export async function clinicOverview(db:Database,scope:PatientScope,raw:unknown){
 const parsed=z.object({startsAt:z.iso.datetime({offset:true}),endsAt:z.iso.datetime({offset:true})}).strict().refine(v=>+new Date(v.endsAt)>+new Date(v.startsAt)&&+new Date(v.endsAt)-+new Date(v.startsAt)<=26*60*60*1000).safeParse(raw);
 if(!parsed.success)throw new AppError(400,'INVALID_RANGE','Choose a valid day range.');
 const ctx=await resolveContext(db,scope.authUserId,scope.clinicId,scope.branchId);authorize(ctx,'patient.demographics.read');
 const [total]=await db.select({value:count()}).from(patients).where(eq(patients.clinicId,ctx.clinicId));
 if(!ctx.permissions.has('appointment.read'))return {patients:total.value,appointments:null};
 const rows=await db.select({status:appointments.status,value:count()}).from(appointments).where(and(eq(appointments.clinicId,ctx.clinicId),eq(appointments.branchId,ctx.branchId),lt(appointments.startsAt,new Date(parsed.data.endsAt)),gt(appointments.endsAt,new Date(parsed.data.startsAt)))).groupBy(appointments.status);
 return {patients:total.value,appointments:Object.fromEntries(appointmentStatuses.map(status=>[status,rows.find(r=>r.status===status)?.value||0])) as Record<AppointmentStatus,number>};
}

// Appointments per clinic-local day for the chart on the overview: "done" are completed visits, "open" are the rest
// that still count (booked, confirmed, arrived, waiting, in the chair). Cancelled and no-show are left out.
export const trendLengths=[7,14,30] as const;
export async function appointmentTrend(db:Database,scope:PatientScope,raw:unknown){
 const parsed=z.coerce.number().pipe(z.union(trendLengths.map(n=>z.literal(n)) as [z.ZodLiteral<7>,z.ZodLiteral<14>,z.ZodLiteral<30>])).safeParse(raw);
 if(!parsed.success)throw new AppError(400,'INVALID_RANGE','Choose 7, 14 or 30 days.');
 const ctx=await resolveContext(db,scope.authUserId,scope.clinicId,scope.branchId);authorize(ctx,'appointment.read');
 const [clinic]=await db.select({timezone:clinics.timezone}).from(clinics).where(eq(clinics.id,ctx.clinicId));
 const days=parsed.data;const tz=clinic.timezone;
 const local=sql`(${appointments.startsAt} at time zone ${tz})::date`;
 const rows=await db.select({day:sql<string>`to_char(${local},'YYYY-MM-DD')`,done:sql<number>`count(*) filter (where ${appointments.status}='completed')::int`,open:sql<number>`count(*) filter (where ${appointments.status} not in ('completed','cancelled','no_show'))::int`})
  .from(appointments)
  .where(and(eq(appointments.clinicId,ctx.clinicId),eq(appointments.branchId,ctx.branchId),sql`${local} between (now() at time zone ${tz})::date - ${days - 1}::int and (now() at time zone ${tz})::date`))
  .groupBy(sql`1`);
 const [today]=await db.select({day:sql<string>`to_char((now() at time zone ${tz})::date,'YYYY-MM-DD')`}).from(clinics).where(eq(clinics.id,ctx.clinicId));
 const end=new Date(`${today.day}T00:00:00Z`);
 return {days:Array.from({length:days},(_,i)=>{const d=new Date(end);d.setUTCDate(d.getUTCDate()-(days-1-i));const key=d.toISOString().slice(0,10);const r=rows.find(x=>x.day===key);return {day:key,done:r?.done??0,open:r?.open??0};})};
}

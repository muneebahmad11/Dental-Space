import { and,count,eq,gt,lt } from 'drizzle-orm';
import { z } from 'zod';
import { authorize,resolveContext,type Database } from '../auth/context.ts';
import { patients } from '../db/schema/patients.ts';
import { appointments } from '../db/schema/appointments.ts';
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

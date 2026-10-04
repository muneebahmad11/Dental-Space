import { createHash,randomUUID } from 'node:crypto';
import { and,eq,sql } from 'drizzle-orm';
import { z } from 'zod';
import { completeItemInput,billCompletionInput } from '../../lib/plans/contracts.ts';
import { businessDate } from '../../lib/finance/contracts.ts';
import { authorize,resolveContext,type Database } from '../auth/context.ts';
import { clinics } from '../db/schema/organization.ts';
import { treatmentPlans,planVersions,treatmentCompletions,treatmentChargeLinks } from '../db/schema/plans.ts';
import { auditEvents } from '../db/schema/security.ts';
import { postCharge } from '../finance/service.ts';
import { AppError } from '../http/errors.ts';
import type { PatientScope } from '../patients/service.ts';
function parse<T>(schema:z.ZodType<T>,raw:unknown):T{const r=schema.safeParse(raw);if(!r.success)throw new AppError(400,'INVALID_INPUT','Check the treatment quantity, date and completion note.');return r.data;}
async function context(db:Database,s:PatientScope,permission:'plan.complete'|'charge.post'){
 parse(z.object({authUserId:z.uuid(),clinicId:z.uuid(),branchId:z.uuid()}),s);const c=await resolveContext(db,s.authUserId,s.clinicId,s.branchId);
 for(const p of ['patient.demographics.read','patient.clinical.read','plan.read',permission] as const)authorize(c,p);return c;
}
const digest=(raw:unknown)=>createHash('sha256').update(JSON.stringify(raw)).digest('hex');
async function lock(db:Database,s:PatientScope,id:string){await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${s.clinicId+':'+s.branchId+':treatment-operation:'+id},0))`);}
async function audit(db:Database,s:PatientScope,actor:string,id:string,action:string){await db.insert(auditEvents).values({clinicId:s.clinicId,branchId:s.branchId,actorMembershipId:actor,entityId:id,entityType:'treatment_completion',action,requestId:randomUUID()});}
export async function completeTreatment(db:Database,s:PatientScope,planId:string,raw:unknown){parse(z.uuid(),planId);const input=parse(completeItemInput,raw);const hash=digest({planId,...input});return db.transaction(async tx=>{
 const c=await context(tx,s,'plan.complete');await lock(tx,s,input.operationId);
 const [old]=await tx.select().from(treatmentCompletions).where(and(eq(treatmentCompletions.clinicId,s.clinicId),eq(treatmentCompletions.branchId,s.branchId),eq(treatmentCompletions.operationId,input.operationId)));if(old){if(old.payloadHash!==hash)throw new AppError(409,'OPERATION_CONFLICT','This completion key has different details.');return {id:old.id};}
 const [plan]=await tx.select().from(treatmentPlans).where(and(eq(treatmentPlans.clinicId,s.clinicId),eq(treatmentPlans.branchId,s.branchId),eq(treatmentPlans.id,planId))).for('update');if(!plan)throw new AppError(404,'PLAN_NOT_FOUND','Plan is not available in this branch.');if(plan.status!=='accepted'||plan.version!==input.expectedVersion)throw new AppError(409,'PLAN_NOT_ACCEPTED','Review and accept the current estimate before recording completed work.');
 const [version]=await tx.select().from(planVersions).where(and(eq(planVersions.planId,planId),eq(planVersions.version,plan.version)));const item=version?.snapshot.items.find(item=>item.id===input.itemId);if(!item)throw new AppError(404,'ITEM_NOT_FOUND','Treatment item is not in the accepted estimate.');
 if(BigInt(item.unitPriceMinor)*BigInt(input.quantity)>BigInt(99999999))throw new AppError(409,'COMPLETION_LIMIT','Record a smaller completed quantity so it fits the current per-charge limit.');
 const [clinic]=await tx.select().from(clinics).where(eq(clinics.id,s.clinicId));if(input.performedOn>businessDate(clinic.timezone))throw new AppError(400,'DATE_FUTURE','Completed work cannot be dated in the future.');
 const [count]=await tx.select({quantity:sql<string>`coalesce(sum(${treatmentCompletions.quantity}),0)::text`}).from(treatmentCompletions).where(and(eq(treatmentCompletions.planId,planId),eq(treatmentCompletions.itemId,input.itemId)));if(Number(count.quantity)+input.quantity>item.quantity)throw new AppError(409,'QUANTITY_EXCEEDED','Completion exceeds the accepted remaining quantity. Reload the plan.');
 const [row]=await tx.insert(treatmentCompletions).values({clinicId:s.clinicId,branchId:s.branchId,patientId:plan.patientId,planId,version:plan.version,itemId:input.itemId,quantity:input.quantity,performedOn:input.performedOn,note:input.note,actorMembershipId:c.membershipId,operationId:input.operationId,payloadHash:hash}).returning();await audit(tx,s,c.membershipId,row.id,'treatment.completed');return {id:row.id};
 });}
export async function billTreatment(db:Database,s:PatientScope,completionId:string,raw:unknown){parse(z.uuid(),completionId);const input=parse(billCompletionInput,raw);const hash=digest({completionId,...input});return db.transaction(async tx=>{
 const c=await context(tx,s,'charge.post');await lock(tx,s,input.operationId);
 const [old]=await tx.select().from(treatmentChargeLinks).where(and(eq(treatmentChargeLinks.clinicId,s.clinicId),eq(treatmentChargeLinks.branchId,s.branchId),eq(treatmentChargeLinks.operationId,input.operationId)));if(old){if(old.payloadHash!==hash)throw new AppError(409,'OPERATION_CONFLICT','This billing key has different details.');return {id:old.id,chargeId:old.chargeId};}
 await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${s.clinicId+':'+s.branchId+':completion-bill:'+completionId},0))`);
 const [completion]=await tx.select().from(treatmentCompletions).where(and(eq(treatmentCompletions.clinicId,s.clinicId),eq(treatmentCompletions.branchId,s.branchId),eq(treatmentCompletions.id,completionId)));if(!completion)throw new AppError(404,'COMPLETION_NOT_FOUND','Completed treatment is not available in this branch.');
 const [existing]=await tx.select().from(treatmentChargeLinks).where(eq(treatmentChargeLinks.completionId,completionId));if(existing)throw new AppError(409,'ALREADY_BILLED','This completed treatment already has a charge. Reload the plan.');
 const [version]=await tx.select().from(planVersions).where(and(eq(planVersions.planId,completion.planId),eq(planVersions.version,completion.version)));const item=version?.snapshot.items.find(item=>item.id===completion.itemId);if(!item)throw new AppError(409,'ESTIMATE_INTEGRITY','The accepted treatment price could not be found.');const amount=BigInt(item.unitPriceMinor)*BigInt(completion.quantity);if(amount>BigInt(99999999))throw new AppError(409,'CHARGE_LIMIT','This completion exceeds the current per-charge limit. Request billing review.');
 const description=`${item.description}${item.tooth?` · ${item.tooth}`:''} · qty ${completion.quantity}`.slice(0,240);
 const charge=await postCharge(tx,s,{operationId:input.operationId,patientId:completion.patientId,description,amount:`${amount/BigInt(100)}.${(amount%BigInt(100)).toString().padStart(2,'0')}`});
 const [link]=await tx.insert(treatmentChargeLinks).values({clinicId:s.clinicId,branchId:s.branchId,patientId:completion.patientId,completionId,chargeId:charge.id,actorMembershipId:c.membershipId,operationId:input.operationId,payloadHash:hash}).returning();await audit(tx,s,c.membershipId,link.id,'treatment.charge_linked');return {id:link.id,chargeId:charge.id};
 });}

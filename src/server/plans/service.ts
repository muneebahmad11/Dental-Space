import { createHash,randomUUID } from 'node:crypto';
import { and,desc,eq,sql } from 'drizzle-orm';
import { z } from 'zod';
import { acceptPlanInput,createPlanInput,planSnapshot,savePlanInput } from '../../lib/plans/contracts.ts';
import { authorize,resolveContext,type Database } from '../auth/context.ts';
import { clinics } from '../db/schema/organization.ts';
import { treatmentPlans,planVersions,planAcceptances } from '../db/schema/plans.ts';
import { patients } from '../db/schema/patients.ts';
import { auditEvents } from '../db/schema/security.ts';
import { AppError } from '../http/errors.ts';
import type { PatientScope } from '../patients/service.ts';
function parse<T>(schema:z.ZodType<T>,raw:unknown):T{const result=schema.safeParse(raw);if(!result.success)throw new AppError(400,'INVALID_INPUT','Check the treatment items, prices and estimate version.');return result.data;}
const scoped=(s:PatientScope)=>and(eq(treatmentPlans.clinicId,s.clinicId),eq(treatmentPlans.branchId,s.branchId));
const hash=(raw:unknown)=>createHash('sha256').update(JSON.stringify(raw)).digest('hex');
async function context(db:Database,s:PatientScope,permission:'plan.read'|'plan.write'|'plan.accept'='plan.read'){
 parse(z.object({authUserId:z.uuid(),clinicId:z.uuid(),branchId:z.uuid()}),s);
 const c=await resolveContext(db,s.authUserId,s.clinicId,s.branchId);
 for(const p of ['patient.demographics.read','patient.clinical.read','plan.read',permission] as const)authorize(c,p);
 return c;
}
async function operationLock(db:Database,s:PatientScope,id:string){await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${s.clinicId+':'+s.branchId+':plan-operation:'+id},0))`);}
async function audit(db:Database,s:PatientScope,actor:string,id:string,action:string){await db.insert(auditEvents).values({clinicId:s.clinicId,branchId:s.branchId,actorMembershipId:actor,entityId:id,entityType:'treatment_plan',action,requestId:randomUUID()});}
function replay(old:{payloadHash:string}|undefined,digest:string){if(old&&old.payloadHash!==digest)throw new AppError(409,'OPERATION_CONFLICT','This operation key has different estimate details.');}
async function lockedPlan(db:Database,s:PatientScope,id:string,version:number){const [plan]=await db.select().from(treatmentPlans).where(and(scoped(s),eq(treatmentPlans.id,id))).for('update');if(!plan)throw new AppError(404,'PLAN_NOT_FOUND','Plan is not available in this branch.');if(plan.status!=='draft'||plan.version!==version)throw new AppError(409,'PLAN_CONFLICT','The estimate changed or was accepted. Reload before continuing.');return plan;}
export async function createPlan(db:Database,s:PatientScope,raw:unknown){const input=parse(createPlanInput,raw);const digest=hash(input);return db.transaction(async tx=>{
 const c=await context(tx,s,'plan.write');await operationLock(tx,s,input.operationId);
 const [old]=await tx.select().from(treatmentPlans).where(and(scoped(s),eq(treatmentPlans.operationId,input.operationId)));replay(old,digest);if(old)return {id:old.id,version:old.version};
 const [clinic]=await tx.select({currency:clinics.currency}).from(clinics).where(eq(clinics.id,s.clinicId));if(clinic?.currency!=='PKR')throw new AppError(409,'CURRENCY_UNSUPPORTED','Estimates currently support PKR clinics.');
 const [patient]=await tx.select({id:patients.id}).from(patients).where(and(eq(patients.clinicId,s.clinicId),eq(patients.id,input.patientId)));if(!patient)throw new AppError(404,'PATIENT_NOT_FOUND','Patient is not available in this clinic.');
 const [plan]=await tx.insert(treatmentPlans).values({clinicId:s.clinicId,branchId:s.branchId,patientId:input.patientId,authorMembershipId:c.membershipId,operationId:input.operationId,payloadHash:digest}).returning();
 await tx.insert(planVersions).values({clinicId:s.clinicId,branchId:s.branchId,planId:plan.id,version:1,actorMembershipId:c.membershipId,snapshot:planSnapshot(input.body),operationId:input.operationId,payloadHash:digest});await audit(tx,s,c.membershipId,plan.id,'plan.created');return {id:plan.id,version:1};
 });}
export async function listPlans(db:Database,s:PatientScope){await context(db,s);return db.select({id:treatmentPlans.id,patientName:patients.name,status:treatmentPlans.status,version:treatmentPlans.version,createdAt:treatmentPlans.createdAt,title:sql<string>`${planVersions.snapshot}->>'title'`,totalMinor:sql<string>`${planVersions.snapshot}->>'totalMinor'`}).from(treatmentPlans).innerJoin(patients,and(eq(patients.id,treatmentPlans.patientId),eq(patients.clinicId,treatmentPlans.clinicId))).innerJoin(planVersions,and(eq(planVersions.planId,treatmentPlans.id),eq(planVersions.clinicId,treatmentPlans.clinicId),eq(planVersions.branchId,treatmentPlans.branchId),eq(planVersions.version,treatmentPlans.version))).where(scoped(s)).orderBy(desc(treatmentPlans.createdAt),desc(treatmentPlans.id)).limit(50);}
export async function readPlan(db:Database,s:PatientScope,id:string){parse(z.uuid(),id);return db.transaction(async tx=>{
 const c=await context(tx,s);const [row]=await tx.select({plan:treatmentPlans,patientName:patients.name}).from(treatmentPlans).innerJoin(patients,and(eq(patients.id,treatmentPlans.patientId),eq(patients.clinicId,treatmentPlans.clinicId))).where(and(scoped(s),eq(treatmentPlans.id,id)));if(!row)throw new AppError(404,'PLAN_NOT_FOUND','Plan is not available in this branch.');
 const versions=await tx.select().from(planVersions).where(and(eq(planVersions.clinicId,s.clinicId),eq(planVersions.branchId,s.branchId),eq(planVersions.planId,id))).orderBy(desc(planVersions.version)).limit(100);
 const [acceptance]=await tx.select().from(planAcceptances).where(and(eq(planAcceptances.clinicId,s.clinicId),eq(planAcceptances.branchId,s.branchId),eq(planAcceptances.planId,id)));
 return {...row,versions,acceptance:acceptance??null,canWrite:c.permissions.has('plan.write'),canAccept:c.permissions.has('plan.accept')};
 },{isolationLevel:'repeatable read'});}
export async function savePlan(db:Database,s:PatientScope,id:string,raw:unknown){parse(z.uuid(),id);const input=parse(savePlanInput,raw);const digest=hash({id,...input});return db.transaction(async tx=>{
 const c=await context(tx,s,'plan.write');await operationLock(tx,s,input.operationId);
 const [old]=await tx.select().from(planVersions).where(and(eq(planVersions.clinicId,s.clinicId),eq(planVersions.branchId,s.branchId),eq(planVersions.operationId,input.operationId)));replay(old,digest);if(old)return {id:old.planId,version:old.version};
 const plan=await lockedPlan(tx,s,id,input.expectedVersion);const version=plan.version+1;
 await tx.insert(planVersions).values({clinicId:s.clinicId,branchId:s.branchId,planId:id,version,actorMembershipId:c.membershipId,snapshot:planSnapshot(input.body),operationId:input.operationId,payloadHash:digest});
 await tx.update(treatmentPlans).set({version}).where(eq(treatmentPlans.id,id));await audit(tx,s,c.membershipId,id,'plan.estimate_saved');return {id,version};
 });}
export async function acceptPlan(db:Database,s:PatientScope,id:string,raw:unknown){parse(z.uuid(),id);const input=parse(acceptPlanInput,raw);const digest=hash({id,...input});return db.transaction(async tx=>{
 const c=await context(tx,s,'plan.accept');await operationLock(tx,s,input.operationId);
 const [old]=await tx.select().from(planAcceptances).where(and(eq(planAcceptances.clinicId,s.clinicId),eq(planAcceptances.branchId,s.branchId),eq(planAcceptances.operationId,input.operationId)));replay(old,digest);if(old)return {id:old.id,version:old.version};
 await lockedPlan(tx,s,id,input.expectedVersion);
 const [acceptance]=await tx.insert(planAcceptances).values({clinicId:s.clinicId,branchId:s.branchId,planId:id,version:input.expectedVersion,actorMembershipId:c.membershipId,acceptedBy:input.acceptedBy,evidence:input.evidence,operationId:input.operationId,payloadHash:digest}).returning();
 await tx.update(treatmentPlans).set({status:'accepted'}).where(eq(treatmentPlans.id,id));await audit(tx,s,c.membershipId,acceptance.id,'plan.acceptance_recorded');return {id:acceptance.id,version:acceptance.version};
 });}

import { createHash,randomUUID } from 'node:crypto';
import { and,asc,desc,eq,ilike,or,sql } from 'drizzle-orm';
import { z } from 'zod';
import { createProcedureInput,procedureQuery,updateProcedureInput,type ProcedureSnapshot } from '../../lib/procedures/contracts.ts';
import { authorize,resolveContext,type Database } from '../auth/context.ts';
import { appUsers,memberships } from '../db/schema/organization.ts';
import { procedures,procedureVersions } from '../db/schema/procedures.ts';
import { auditEvents } from '../db/schema/security.ts';
import { AppError } from '../http/errors.ts';
import type { PatientScope } from '../patients/service.ts';
const parse=<T>(schema:z.ZodType<T>,value:unknown):T=>{const r=schema.safeParse(value);if(!r.success)throw new AppError(400,'INVALID_INPUT','Check the procedure name, duration and price.');return r.data;};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields={id:procedures.id,code:procedures.code,name:procedures.name,category:procedures.category,defaultMinutes:procedures.defaultMinutes,priceMinor:procedures.priceMinor,active:procedures.active,version:procedures.version};
// The catalog holds no patient data; any active branch member may read it. Changes need procedure.configure.
async function context(db:Database,s:PatientScope,write=false){parse(z.object({authUserId:z.uuid(),clinicId:z.uuid(),branchId:z.uuid()}),s);const c=await resolveContext(db,s.authUserId,s.clinicId,s.branchId);if(write)authorize(c,'procedure.configure');return c;}
async function lock(db:Database,s:PatientScope){await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${s.clinicId+':procedure-catalog'},0))`);}
async function replay(db:Database,s:PatientScope,operationId:string,digest:string){
 const [row]=await db.select().from(procedureVersions).where(and(eq(procedureVersions.clinicId,s.clinicId),eq(procedureVersions.operationId,operationId)));
 if(row&&row.payloadHash!==digest)throw new AppError(409,'OPERATION_CONFLICT','This operation key has different procedure details.');
 return row?{id:row.procedureId,version:row.version}:null;
}
async function unique(db:Database,s:PatientScope,name:string,code:string,exceptId?:string){
 const except=exceptId?sql`and id<>${exceptId}`:sql``;
 if((await db.execute(sql`select 1 from clinic_app.procedures where clinic_id=${s.clinicId} and lower(name)=lower(${name}) ${except} limit 1`)).length)throw new AppError(409,'NAME_EXISTS','A procedure with this name already exists.');
 if(code&&(await db.execute(sql`select 1 from clinic_app.procedures where clinic_id=${s.clinicId} and code<>'' and lower(code)=lower(${code}) ${except} limit 1`)).length)throw new AppError(409,'CODE_EXISTS','A procedure with this code already exists.');
}
async function record(db:Database,s:PatientScope,actor:string,id:string,version:number,snapshot:ProcedureSnapshot,operationId:string,digest:string,action:string){
 await db.insert(procedureVersions).values({clinicId:s.clinicId,branchId:s.branchId,procedureId:id,version,snapshot,actorMembershipId:actor,operationId,payloadHash:digest});
 await db.insert(auditEvents).values({clinicId:s.clinicId,branchId:s.branchId,actorMembershipId:actor,entityId:id,entityType:'procedure',action:`procedure.${action}`,requestId:randomUUID()});
}
export async function listProcedures(db:Database,s:PatientScope,raw:unknown){
 const q=parse(procedureQuery,raw);
 return db.transaction(async tx=>{
  const c=await context(tx,s);const term=q.search.replace(/[\\%_]/g,m=>`\\${m}`);
  const items=await tx.select(fields).from(procedures).where(and(eq(procedures.clinicId,s.clinicId),q.includeInactive==='true'?undefined:eq(procedures.active,true),term?or(ilike(procedures.name,`%${term}%`),ilike(procedures.code,`%${term}%`)):undefined)).orderBy(desc(procedures.active),asc(procedures.category),asc(procedures.name)).limit(500);
  return {items,canConfigure:c.permissions.has('procedure.configure')};
 });
}
export async function procedureHistory(db:Database,s:PatientScope,id:string){
 parse(z.uuid(),id);
 return db.transaction(async tx=>{
  await context(tx,s);
  const [procedure]=await tx.select(fields).from(procedures).where(and(eq(procedures.clinicId,s.clinicId),eq(procedures.id,id)));
  if(!procedure)throw new AppError(404,'PROCEDURE_NOT_FOUND','Procedure is not available in this clinic.');
  const history=await tx.select({version:procedureVersions.version,snapshot:procedureVersions.snapshot,createdAt:procedureVersions.createdAt,actorName:appUsers.displayName}).from(procedureVersions).innerJoin(memberships,and(eq(memberships.id,procedureVersions.actorMembershipId),eq(memberships.clinicId,procedureVersions.clinicId))).innerJoin(appUsers,eq(appUsers.id,memberships.userId)).where(and(eq(procedureVersions.clinicId,s.clinicId),eq(procedureVersions.procedureId,id))).orderBy(desc(procedureVersions.version)).limit(100);
  return {procedure,history};
 });
}
export async function createProcedure(db:Database,s:PatientScope,raw:unknown){
 const input=parse(createProcedureInput,raw);const digest=hash({action:'create',...input});
 return db.transaction(async tx=>{
  const c=await context(tx,s,true);await lock(tx,s);const old=await replay(tx,s,input.operationId,digest);if(old)return old;
  await unique(tx,s,input.name,input.code);
  const [row]=await tx.insert(procedures).values({clinicId:s.clinicId,code:input.code,name:input.name,category:input.category,defaultMinutes:input.defaultMinutes,priceMinor:input.price}).returning(fields);
  await record(tx,s,c.membershipId,row.id,1,{code:row.code,name:row.name,category:row.category,defaultMinutes:row.defaultMinutes,priceMinor:row.priceMinor,active:true},input.operationId,digest,'created');
  return {id:row.id,version:1};
 });
}
export async function updateProcedure(db:Database,s:PatientScope,id:string,raw:unknown){
 parse(z.uuid(),id);const input=parse(updateProcedureInput,raw);const digest=hash({action:'update',id,...input});
 return db.transaction(async tx=>{
  const c=await context(tx,s,true);await lock(tx,s);const old=await replay(tx,s,input.operationId,digest);if(old)return old;
  const [row]=await tx.select().from(procedures).where(and(eq(procedures.clinicId,s.clinicId),eq(procedures.id,id))).for('update');
  if(!row)throw new AppError(404,'PROCEDURE_NOT_FOUND','Procedure is not available in this clinic.');
  if(row.version!==input.expectedVersion)throw new AppError(409,'PROCEDURE_CONFLICT','This procedure changed. Reload before saving.');
  await unique(tx,s,input.name,input.code,id);
  const snapshot={code:input.code,name:input.name,category:input.category,defaultMinutes:input.defaultMinutes,priceMinor:input.price,active:input.active};
  await tx.update(procedures).set({...snapshot,version:row.version+1,updatedAt:new Date()}).where(eq(procedures.id,id));
  await record(tx,s,c.membershipId,id,row.version+1,snapshot,input.operationId,digest,row.active===input.active?'updated':input.active?'reactivated':'deactivated');
  return {id,version:row.version+1};
 });
}
// Used by booking to default duration; inactive procedures cannot be chosen for new work.
export async function activeProcedure(db:Database,clinicId:string,id:string){
 const [row]=await db.select(fields).from(procedures).where(and(eq(procedures.clinicId,clinicId),eq(procedures.id,id),eq(procedures.active,true)));
 if(!row)throw new AppError(404,'PROCEDURE_NOT_FOUND','Choose an active procedure from the catalog.');
 return row;
}

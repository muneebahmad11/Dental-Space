import './load-env.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { migrationEnvironment,requireLocalDatabase,connectionOptions } from '../src/lib/config/environment.ts';
import { clinics,branches,appUsers,memberships,membershipBranches } from '../src/server/db/schema/organization.ts';
import { membershipGrants } from '../src/server/db/schema/security.ts';
import { activeProcedure,createProcedure,listProcedures,procedureHistory,updateProcedure } from '../src/server/procedures/service.ts';
import { AppError } from '../src/server/http/errors.ts';
const {MIGRATION_DATABASE_URL:url}=migrationEnvironment(process.env);requireLocalDatabase(url);const client=postgres(url,{...connectionOptions(url),max:1});const rollback=new Error('ROLLBACK_FIXTURES');const status=(n:number)=>(e:unknown)=>e instanceof AppError&&e.status===n;
try{try{await drizzle(client).transaction(async tx=>{
 await tx.execute(sql`select pg_advisory_xact_lock(73492011)`);
 const [clinic]=await tx.insert(clinics).values({name:'Synthetic catalog',currency:'PKR',timezone:'Asia/Karachi'}).returning();const [branch]=await tx.insert(branches).values({clinicId:clinic.id,name:'Main branch'}).returning();const [second]=await tx.insert(branches).values({clinicId:clinic.id,name:'Second branch'}).returning();const [otherClinic]=await tx.insert(clinics).values({name:'Other clinic',currency:'PKR',timezone:'Asia/Karachi'}).returning();const [otherBranch]=await tx.insert(branches).values({clinicId:otherClinic.id,name:'Other branch'}).returning();
 const person=async(clinicId:string,branchIds:string[],permissions:string[])=>{const authUserId=randomUUID();const [user]=await tx.insert(appUsers).values({authUserId,displayName:'Synthetic staff'}).returning();const [member]=await tx.insert(memberships).values({clinicId,userId:user.id}).returning();await tx.insert(membershipBranches).values(branchIds.map(branchId=>({clinicId,membershipId:member.id,branchId})));if(permissions.length)await tx.insert(membershipGrants).values(permissions.map(permission=>({clinicId,membershipId:member.id,permission})));return {authUserId,member};};
 const owner=await person(clinic.id,[branch.id,second.id],['procedure.configure']);const staff=await person(clinic.id,[branch.id],[]);const outsider=await person(otherClinic.id,[otherBranch.id],['procedure.configure']);
 const scope={authUserId:owner.authUserId,clinicId:clinic.id,branchId:branch.id};const staffScope={...scope,authUserId:staff.authUserId};const otherScope={authUserId:outsider.authUserId,clinicId:otherClinic.id,branchId:otherBranch.id};
 await tx.execute(sql`set local role clinic_runtime`);
 const input={operationId:randomUUID(),code:'RCT',name:'Root canal treatment',category:'Endodontic',defaultMinutes:60,price:'15000.00'};
 const created=await createProcedure(tx,scope,input);assert.equal((await createProcedure(tx,scope,input)).id,created.id);
 await assert.rejects(createProcedure(tx,scope,{...input,price:'16000.00'}),status(409));
 await assert.rejects(createProcedure(tx,scope,{...input,operationId:randomUUID(),code:'',name:'root CANAL treatment'}),status(409));
 await assert.rejects(createProcedure(tx,scope,{...input,operationId:randomUUID(),code:'rct',name:'Different name'}),status(409));
 await assert.rejects(createProcedure(tx,scope,{...input,operationId:randomUUID(),price:'0'}),status(400));
 await assert.rejects(createProcedure(tx,staffScope,{...input,operationId:randomUUID(),name:'Staff procedure',code:''}),status(403));
 const scaling=await createProcedure(tx,{...scope,branchId:second.id},{operationId:randomUUID(),code:'',name:'Scaling',category:'Preventive',defaultMinutes:30,price:null});
 assert.equal((await createProcedure(tx,otherScope,{...input,operationId:randomUUID()})).version,1);
 // Price changes create new versions; the earlier price stays in history.
 const change={operationId:randomUUID(),expectedVersion:1,code:'RCT',name:'Root canal treatment',category:'Endodontic',defaultMinutes:90,price:'18000.00',active:true};
 assert.equal((await updateProcedure(tx,scope,created.id,change)).version,2);assert.equal((await updateProcedure(tx,scope,created.id,change)).version,2);
 await assert.rejects(updateProcedure(tx,scope,created.id,{...change,operationId:randomUUID()}),status(409));
 await assert.rejects(updateProcedure(tx,scope,created.id,{...change,operationId:randomUUID(),expectedVersion:2,name:'Scaling'}),status(409));
 await assert.rejects(updateProcedure(tx,otherScope,created.id,{...change,operationId:randomUUID(),expectedVersion:2}),status(404));
 const history=await procedureHistory(tx,staffScope,created.id);assert.deepEqual(history.history.map(h=>[h.version,h.snapshot.priceMinor,h.snapshot.defaultMinutes]),[[2,1800000,90],[1,1500000,60]]);
 // Any branch member can read the clinic catalog; inactive procedures are hidden and cannot be chosen.
 assert.equal((await listProcedures(tx,staffScope,{})).items.length,2);assert.equal((await listProcedures(tx,staffScope,{})).canConfigure,false);
 assert.equal((await listProcedures(tx,staffScope,{search:'rct'})).items.length,1);assert.equal((await listProcedures(tx,staffScope,{search:'%'})).items.length,0);
 assert.equal((await listProcedures(tx,otherScope,{})).items.length,1);
 await updateProcedure(tx,scope,scaling.id,{operationId:randomUUID(),expectedVersion:1,code:'',name:'Scaling',category:'Preventive',defaultMinutes:30,price:null,active:false});
 assert.equal((await listProcedures(tx,scope,{})).items.length,1);assert.equal((await listProcedures(tx,scope,{includeInactive:'true'})).items.length,2);
 await assert.rejects(activeProcedure(tx,clinic.id,scaling.id),status(404));await assert.rejects(activeProcedure(tx,otherClinic.id,created.id),status(404));assert.equal((await activeProcedure(tx,clinic.id,created.id)).defaultMinutes,90);
 // Audit failure rolls back the change; version history cannot be altered.
 await tx.execute(sql`reset role`);await tx.execute(sql`revoke insert on clinic_app.audit_events from clinic_runtime`);await tx.execute(sql`set local role clinic_runtime`);
 await assert.rejects(createProcedure(tx,scope,{operationId:randomUUID(),code:'',name:'Extraction',category:'Oral surgery',defaultMinutes:30,price:'3000'}));
 await tx.execute(sql`reset role`);await tx.execute(sql`grant insert on clinic_app.audit_events to clinic_runtime`);
 const count=await tx.execute<{count:string}>(sql`select count(*)::text as count from clinic_app.procedures where clinic_id=${clinic.id}`);assert.equal(count[0].count,'2');
 for(const query of [sql`update clinic_app.procedure_versions set snapshot='{}'::jsonb where clinic_id=${clinic.id}`,sql`delete from clinic_app.procedure_versions where clinic_id=${clinic.id}`,sql`truncate clinic_app.procedure_versions`])await assert.rejects(tx.transaction(async nested=>{await nested.execute(query);}));
 await tx.execute(sql`set local role clinic_runtime`);await assert.rejects(tx.transaction(async nested=>{await nested.execute(sql`delete from clinic_app.procedures where id=${created.id}`);}));
 throw rollback;
 });}catch(e){if(e!==rollback)throw e;}console.log('Procedure catalog integration passed: exact prices, versioned price/duration history, retries, unique names/codes, clinic isolation, inactive exclusion, permissions, immutable history and audit rollback. Fixtures rolled back.');}catch(e){console.error('Procedure catalog integration failed.',e instanceof assert.AssertionError?e.message:e instanceof AppError?e.code:e);process.exitCode=1;}finally{await client.end();}

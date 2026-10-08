import './load-env.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { migrationEnvironment,requireLocalDatabase,connectionOptions } from '../src/lib/config/environment.ts';
import { clinics,branches,appUsers,memberships,membershipBranches } from '../src/server/db/schema/organization.ts';
import { membershipGrants } from '../src/server/db/schema/security.ts';
import { patients } from '../src/server/db/schema/patients.ts';
import { listRecentPatients,recordPatientView } from '../src/server/patients/recent.ts';
import { AppError } from '../src/server/http/errors.ts';
const {MIGRATION_DATABASE_URL:url}=migrationEnvironment(process.env);requireLocalDatabase(url);const client=postgres(url,{...connectionOptions(url),max:1});const rollback=new Error('ROLLBACK_FIXTURES');const status=(n:number)=>(e:unknown)=>e instanceof AppError&&e.status===n;
try{try{await drizzle(client).transaction(async tx=>{
 await tx.execute(sql`select pg_advisory_xact_lock(73492013)`);
 const [clinic]=await tx.insert(clinics).values({name:'Synthetic navigation',currency:'PKR',timezone:'Asia/Karachi'}).returning();const [branch]=await tx.insert(branches).values({clinicId:clinic.id,name:'Main branch'}).returning();
 const [otherClinic]=await tx.insert(clinics).values({name:'Other clinic',currency:'PKR',timezone:'Asia/Karachi'}).returning();
 const person=async(permissions:string[])=>{const authUserId=randomUUID();const [user]=await tx.insert(appUsers).values({authUserId,displayName:'Synthetic staff'}).returning();const [member]=await tx.insert(memberships).values({clinicId:clinic.id,userId:user.id}).returning();await tx.insert(membershipBranches).values({clinicId:clinic.id,membershipId:member.id,branchId:branch.id});if(permissions.length)await tx.insert(membershipGrants).values(permissions.map(permission=>({clinicId:clinic.id,membershipId:member.id,permission})));return {member,scope:{authUserId,clinicId:clinic.id,branchId:branch.id}};};
 const desk=await person(['patient.demographics.read']);const colleague=await person(['patient.demographics.read']);const noAccess=await person([]);
 const make=async(clinicId:string,i:number)=>(await tx.insert(patients).values({creationHash:'synthetic',creationKey:randomUUID(),clinicId,displayId:`NAV${clinicId.slice(0,4)}${i}`,name:`Navigation patient ${i}`,phone:'+92 300 0000000',phoneNormalized:'923000000000'}).returning())[0];
 const list=[];for(let i=0;i<12;i++)list.push(await make(clinic.id,i));const foreign=await make(otherClinic.id,99);
 await tx.execute(sql`set local role clinic_runtime`);
 // Each view moves the patient to the top; repeated views do not duplicate entries; the list holds 10.
 for(const p of list)await recordPatientView(tx,desk.scope,p.id);
 await recordPatientView(tx,desk.scope,list[0].id);
 const recent=await listRecentPatients(tx,desk.scope);assert.equal(recent.length,10);assert.equal(recent[0].id,list[0].id);assert.equal(recent[1].id,list[11].id);assert.equal(new Set(recent.map(r=>r.id)).size,10);
 assert.deepEqual(Object.keys(recent[0]).sort(),['id','name','phone','status','viewedAt']);
 // Lists are personal and clinic-scoped.
 assert.equal((await listRecentPatients(tx,colleague.scope)).length,0);
 await assert.rejects(recordPatientView(tx,desk.scope,foreign.id),status(404));await assert.rejects(recordPatientView(tx,desk.scope,'not-a-uuid'),status(400));
 await assert.rejects(listRecentPatients(tx,noAccess.scope),status(403));await assert.rejects(recordPatientView(tx,noAccess.scope,list[0].id),status(403));
 // Access is re-checked on every read: revoking demographic access hides the list.
 await tx.execute(sql`reset role`);await tx.execute(sql`delete from clinic_app.membership_grants where membership_id=${desk.member.id}`);await tx.execute(sql`set local role clinic_runtime`);
 await assert.rejects(listRecentPatients(tx,desk.scope),status(403));
 await assert.rejects(tx.transaction(async nested=>{await nested.execute(sql`delete from clinic_app.recent_patients`);}));
 throw rollback;
 });}catch(e){if(e!==rollback)throw e;}console.log('Patient navigation integration passed: personal recent list ordering, de-duplication, 10-item limit, clinic isolation, permission re-checks and no runtime deletes. Fixtures rolled back.');}catch(e){console.error('Patient navigation integration failed.',e instanceof assert.AssertionError?e.message:e instanceof AppError?e.code:e);process.exitCode=1;}finally{await client.end();}

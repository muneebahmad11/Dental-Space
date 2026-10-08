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
import { readContactPreferences,saveContactPreferences } from '../src/server/patient-profile/contact.ts';
import { setMessagingPreference,queueMessage,listCommunications } from '../src/server/messaging/service.ts';
import { processOneMessage } from '../src/server/messaging/worker.ts';
import { messagingConfig } from '../src/server/messaging/config.ts';
import { AppError } from '../src/server/http/errors.ts';
const {MIGRATION_DATABASE_URL:url}=migrationEnvironment(process.env);requireLocalDatabase(url);const client=postgres(url,{...connectionOptions(url),max:1});const rollback=new Error('ROLLBACK_FIXTURES');const status=(n:number,code?:string)=>(e:unknown)=>e instanceof AppError&&e.status===n&&(!code||e.code===code);
try{try{await drizzle(client).transaction(async tx=>{
 await tx.execute(sql`select pg_advisory_xact_lock(73492014)`);
 const [clinic]=await tx.insert(clinics).values({name:'Synthetic contact preferences',currency:'PKR',timezone:'Asia/Karachi'}).returning();const [branch]=await tx.insert(branches).values({clinicId:clinic.id,name:'Main branch'}).returning();const [second]=await tx.insert(branches).values({clinicId:clinic.id,name:'Second branch'}).returning();const [other]=await tx.insert(clinics).values({name:'Other clinic',currency:'PKR',timezone:'Asia/Karachi'}).returning();
 const person=async(permissions:string[])=>{const authUserId=randomUUID();const [user]=await tx.insert(appUsers).values({authUserId,displayName:'Synthetic staff'}).returning();const [member]=await tx.insert(memberships).values({clinicId:clinic.id,userId:user.id}).returning();await tx.insert(membershipBranches).values([branch,second].map(b=>({clinicId:clinic.id,membershipId:member.id,branchId:b.id})));await tx.insert(membershipGrants).values(permissions.map(permission=>({clinicId:clinic.id,membershipId:member.id,permission})));return {authUserId,clinicId:clinic.id,branchId:branch.id};};
 const staff=await person(['patient.demographics.read','communication.read','communication.send','communication.preferences.write']);const reader=await person(['patient.demographics.read']);
 const [patient]=await tx.insert(patients).values({clinicId:clinic.id,creationKey:randomUUID(),creationHash:'synthetic',displayId:'SYNTHETIC',name:'Synthetic patient',phone:'+92 300 0000000',phoneNormalized:'923000000000'}).returning();
 const [foreign]=await tx.insert(patients).values({clinicId:other.id,creationKey:randomUUID(),creationHash:'synthetic',displayId:'FOREIGN',name:'Other patient',phone:'+92 300 0000001',phoneNormalized:'923000000001'}).returning();
 await tx.execute(sql`set local role clinic_runtime`);
 // Versioned record: retries replay, stale versions conflict, history keeps every version; clinic-wide across branches.
 const allowAll={doNotContact:false,preferredChannel:'whatsapp',channels:{phone:true,sms:true,whatsapp:true,email:false},purposes:{appointment:true,recall:true,billing:true,marketing:false},note:'Call after 5 pm',source:'in_person'};
 assert.equal((await readContactPreferences(tx,reader,patient.id)).current,null);
 const first={operationId:randomUUID(),expectedVersion:0,body:allowAll,reason:'Asked at registration'};
 assert.equal((await saveContactPreferences(tx,staff,patient.id,first)).version,1);assert.equal((await saveContactPreferences(tx,staff,patient.id,first)).version,1);
 await assert.rejects(saveContactPreferences(tx,staff,patient.id,{...first,reason:'Different reason'}),status(409,'OPERATION_CONFLICT'));
 await assert.rejects(saveContactPreferences(tx,staff,patient.id,{...first,operationId:randomUUID()}),status(409,'PREFERENCES_CONFLICT'));
 await assert.rejects(saveContactPreferences(tx,reader,patient.id,{...first,operationId:randomUUID(),expectedVersion:1}),status(403));
 await assert.rejects(saveContactPreferences(tx,staff,foreign.id,{...first,operationId:randomUUID()}),status(404));
 await assert.rejects(saveContactPreferences(tx,staff,patient.id,{...first,operationId:randomUUID(),expectedVersion:1,body:{...allowAll,preferredChannel:'email'}}),status(400));
 const view=await readContactPreferences(tx,{...reader,branchId:branch.id},patient.id);assert.equal(view.current?.version,1);assert.equal(view.canWrite,false);
 // WhatsApp queueing and the send-time recheck both honour the preferences.
 const config=messagingConfig({WHATSAPP_ENABLED:'true',WHATSAPP_CLINIC_ID:clinic.id,WHATSAPP_BUSINESS_ACCOUNT_ID:'123',WHATSAPP_PHONE_NUMBER_ID:'456',WHATSAPP_API_VERSION:'v25.0',WHATSAPP_ACCESS_TOKEN:'synthetic-token-only',WHATSAPP_APP_SECRET:'synthetic-secret-only',WHATSAPP_VERIFY_TOKEN:'synthetic-verify-only',WHATSAPP_TEMPLATES_JSON:'[{"name":"recall_notice","language":"en_US","label":"Recall","parameters":["Name"],"purpose":"recall"},{"name":"offer_notice","language":"en_US","label":"Offer","parameters":["Name"],"purpose":"marketing"}]'})!;
 await setMessagingPreference(tx,staff,{patientId:patient.id,enabled:true,expectedVersion:0,evidence:'Synthetic WhatsApp consent'});
 const message=(template:string)=>({patientId:patient.id,operationId:randomUUID(),template,language:'en_US',parameters:['Synthetic']});
 await assert.rejects(queueMessage(tx,staff,message('offer_notice'),config),status(409,'CONTACT_NOT_ALLOWED'));
 await queueMessage(tx,staff,message('recall_notice'),config);
 await saveContactPreferences(tx,staff,patient.id,{operationId:randomUUID(),expectedVersion:1,body:{...allowAll,purposes:{...allowAll.purposes,recall:false}},reason:'Patient asked for no recall messages'});
 let sent=0;await processOneMessage(tx,config,async()=>{sent++;return {kind:'accepted',providerMessageId:'synthetic'};});assert.equal(sent,0,'provider must not be called');
 const jobs=(await listCommunications(tx,staff,{patientId:patient.id},config)).communications;assert.equal(jobs[0].state,'cancelled');assert.equal(jobs[0].lastCode,'CONTACT_NOT_ALLOWED');
 await saveContactPreferences(tx,staff,patient.id,{operationId:randomUUID(),expectedVersion:2,body:{...allowAll,doNotContact:true},reason:'Patient asked not to be contacted'});
 await assert.rejects(queueMessage(tx,staff,message('recall_notice'),config),status(409,'CONTACT_NOT_ALLOWED'));
 assert.deepEqual((await readContactPreferences(tx,staff,patient.id)).history.map(h=>h.version),[3,2,1]);
 const audits=await tx.execute<{count:string}>(sql`select count(*)::text as count from clinic_app.audit_events where clinic_id=${clinic.id} and action='patient.contact_preferences.updated'`);assert.equal(audits[0].count,'3');
 // Audit failure rolls back; history is immutable.
 await tx.execute(sql`reset role`);await tx.execute(sql`revoke insert on clinic_app.audit_events from clinic_runtime`);await tx.execute(sql`set local role clinic_runtime`);
 await assert.rejects(saveContactPreferences(tx,staff,patient.id,{operationId:randomUUID(),expectedVersion:3,body:allowAll,reason:'Should roll back'}));
 await tx.execute(sql`reset role`);await tx.execute(sql`grant insert on clinic_app.audit_events to clinic_runtime`);
 assert.equal((await readContactPreferences(tx,staff,patient.id)).current?.version,3);
 for(const query of [sql`update clinic_app.patient_contact_preference_versions set reason='changed' where clinic_id=${clinic.id}`,sql`delete from clinic_app.patient_contact_preference_versions where clinic_id=${clinic.id}`])await assert.rejects(tx.transaction(async nested=>{await nested.execute(query);}));
 throw rollback;
 });}catch(e){if(e!==rollback)throw e;}console.log('Contact preference integration passed: versioned clinic-wide record, retries/conflicts, permissions, clinic isolation, WhatsApp queue and send-time enforcement by purpose, do-not-contact, immutable history and audit rollback. Fixtures rolled back; no network sends.');}catch(e){console.error('Contact preference integration failed.',e instanceof assert.AssertionError?e.message:e instanceof AppError?`${e.code}: ${e.message}`:e);process.exitCode=1;}finally{await client.end();}

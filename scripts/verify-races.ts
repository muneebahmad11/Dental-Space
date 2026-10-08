import './load-env.ts';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrationEnvironment,runtimeEnvironment,requireLocalDatabase,connectionOptions } from '../src/lib/config/environment.ts';
import { bookAppointment,changeAppointmentStatus } from '../src/server/appointments/service.ts';
import { createPatient } from '../src/server/patients/service.ts';
import { AppError } from '../src/server/http/errors.ts';
// Real races need separate connections, which cannot see uncommitted fixtures. This suite therefore builds a
// throwaway database from the reviewed migrations, commits synthetic fixtures there and drops it afterwards.
const {MIGRATION_DATABASE_URL:adminUrl}=migrationEnvironment(process.env);const {DATABASE_URL:runtimeUrl}=runtimeEnvironment(process.env);requireLocalDatabase(adminUrl);requireLocalDatabase(runtimeUrl);
const name=`dental_race_${randomBytes(6).toString('hex')}`;const withDatabase=(value:string)=>{const u=new URL(value);u.pathname=`/${name}`;return u.toString();};
const rounds=Number(process.env.RACE_ROUNDS??40);
const admin=postgres(adminUrl,{...connectionOptions(adminUrl),max:1});
async function migrateThrowaway(sql:postgres.Sql){
 const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8')) as {entries:{tag:string}[]};
 for(const {tag} of journal.entries)for(const statement of readFileSync(`drizzle/${tag}.sql`,'utf8').split('--> statement-breakpoint')){
  // The runtime role is cluster-wide and already exists; every other statement runs exactly as reviewed.
  if(!statement.trim()||/^\s*(--[^\n]*\n\s*)*CREATE ROLE clinic_runtime/.test(statement))continue;
  await sql.unsafe(statement);
 }
}
function settledCodes(results:PromiseSettledResult<unknown>[]){return results.map(r=>r.status==='fulfilled'?'ok':r.reason instanceof AppError?r.reason.code:String(r.reason));}
try{
 await admin.unsafe(`create database ${name}`);
 const setup=postgres(withDatabase(adminUrl),{...connectionOptions(adminUrl),max:1});const runtimes=[0,1].map(()=>postgres(withDatabase(runtimeUrl),{...connectionOptions(runtimeUrl),max:1}));
 try{
  await setup`set client_min_messages to warning`;await migrateThrowaway(setup);
  const [clinic]=await setup`insert into clinic_app.clinics(name,currency,timezone) values ('Race clinic','PKR','Asia/Karachi') returning id`;const [branch]=await setup`insert into clinic_app.branches(clinic_id,name) values (${clinic.id},'Race branch') returning id`;
  const authUserId=randomUUID();const [user]=await setup`insert into clinic_app.app_users(auth_user_id,display_name) values (${authUserId},'Race staff') returning id`;const [member]=await setup`insert into clinic_app.memberships(clinic_id,user_id) values (${clinic.id},${user.id}) returning id`;
  await setup`insert into clinic_app.membership_branches(clinic_id,membership_id,branch_id) values (${clinic.id},${member.id},${branch.id})`;
  for(const permission of ['appointment.read','appointment.write','patient.demographics.read','patient.demographics.write'])await setup`insert into clinic_app.membership_grants(clinic_id,membership_id,permission) values (${clinic.id},${member.id},${permission})`;
  const [dentist]=await setup`insert into clinic_app.schedule_dentists(clinic_id,branch_id,name,color) values (${clinic.id},${branch.id},'Dr. Race','#185d55') returning id`;
  const scope={authUserId,clinicId:clinic.id as string,branchId:branch.id as string};const [one,two]=runtimes.map(r=>drizzle(r));
  const patientIds:string[]=[];for(let i=0;i<2;i++){const [p]=await setup`insert into clinic_app.patients(clinic_id,display_id,name,phone,phone_normalized,creation_key,creation_hash) values (${clinic.id},${'RACE'+i},${'Race patient '+i},'+92 300 000000'||${i},'92300000000'||${i},${randomUUID()},'synthetic') returning id`;patientIds.push(p.id);}
  let booked=0,conflicts=0,statusWins=0,staleLosses=0;
  for(let i=0;i<rounds;i++){
   // Two receptionists book the same dentist slot for different patients at the same moment.
   const start=new Date(Date.UTC(2999,0,1,4,0)+i*3600000);const end=new Date(+start+30*60000);
   const results=await Promise.allSettled([one,two].map((db,n)=>bookAppointment(db,scope,{operationId:randomUUID(),patientId:patientIds[n],dentistId:dentist.id,startsAt:start.toISOString(),endsAt:end.toISOString()})));
   const codes=settledCodes(results);assert.deepEqual([...codes].sort(),['SLOT_CONFLICT','ok'],`round ${i}: ${codes}`);booked++;conflicts++;
   // Both then act on the winning booking with the same expected version: exactly one change applies.
   const winner=results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<{id:string;version:number}>;
   const changes=await Promise.allSettled([[one,'confirmed'],[two,'arrived']].map(([db,status])=>changeAppointmentStatus(db as typeof one,scope,winner.value.id,{operationId:randomUUID(),expectedVersion:winner.value.version,status})));
   assert.deepEqual([...settledCodes(changes)].sort(),['APPOINTMENT_CONFLICT','ok'],`status round ${i}`);statusWins++;staleLosses++;
  }
  // A double-clicked booking (same operation key on two connections) creates exactly one appointment.
  const doubled={operationId:randomUUID(),patientId:patientIds[0],dentistId:dentist.id,startsAt:'2998-06-01T09:00:00+05:00',endsAt:'2998-06-01T09:30:00+05:00'};
  const pair=await Promise.all([one,two].map(db=>bookAppointment(db,scope,doubled)));assert.equal(pair[0].id,pair[1].id);
  // Two receptionists register the same new person at once: the second sees the first as a duplicate candidate.
  const person={name:'Concurrent Registration',phone:'+92 321 7654321',email:''};
  const registrations=await Promise.allSettled([one,two].map(db=>createPatient(db,scope,{...person,operationId:randomUUID()})));
  const registrationCodes=settledCodes(registrations);assert.equal(registrationCodes.filter(c=>c==='ok').length,1,`registrations: ${registrationCodes}`);
  const [counts]=await setup`select (select count(*)::int from clinic_app.appointments) as appointments,(select count(*)::int from clinic_app.patients where name='Concurrent Registration') as registered,(select count(*)::int from clinic_app.appointment_events) as events`;
  assert.equal(counts.appointments,rounds+1);assert.equal(counts.registered,1);assert.equal(counts.events,rounds*2+1);
  console.log(`Concurrency races passed on separate connections: ${booked}/${rounds} contested slots booked once (${conflicts} conflicts), ${statusWins} single status wins (${staleLosses} stale), double-submitted booking stored once, concurrent duplicate registration stored once (${registrationCodes.filter(c=>c!=='ok').join(',')}). Throwaway database dropped.`);
 }finally{await Promise.all([setup.end(),...runtimes.map(r=>r.end())]);}
}catch(e){console.error('Concurrency race verification failed.',e instanceof assert.AssertionError?e.message:e instanceof AppError?e.code:e);process.exitCode=1;}
finally{await admin.unsafe(`drop database if exists ${name} with (force)`).catch(()=>{console.error(`Could not drop throwaway database ${name}; remove it manually.`);process.exitCode=1;});await admin.end();}

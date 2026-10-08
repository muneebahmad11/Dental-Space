import './load-env.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { migrationEnvironment,requireLocalDatabase,connectionOptions } from '../src/lib/config/environment.ts';
import { businessDate } from '../src/lib/finance/contracts.ts';
import { emptyWeek } from '../src/lib/scheduling/contracts.ts';
import { clinics,branches,appUsers,memberships,membershipBranches } from '../src/server/db/schema/organization.ts';
import { membershipGrants } from '../src/server/db/schema/security.ts';
import { patients } from '../src/server/db/schema/patients.ts';
import { addClosure,cancelClosure,createScheduleResource,getScheduleSettings,openingRules,saveOpeningHours,updateScheduleResource } from '../src/server/scheduling/settings.ts';
import { bookAppointment } from '../src/server/appointments/service.ts';
import { AppError } from '../src/server/http/errors.ts';
const {MIGRATION_DATABASE_URL:url}=migrationEnvironment(process.env);requireLocalDatabase(url);const client=postgres(url,{...connectionOptions(url),max:1});const rollback=new Error('ROLLBACK_FIXTURES');const status=(n:number)=>(e:unknown)=>e instanceof AppError&&e.status===n;
try{try{await drizzle(client).transaction(async tx=>{
 await tx.execute(sql`select pg_advisory_xact_lock(73492010)`);
 const [clinic]=await tx.insert(clinics).values({name:'Synthetic scheduling',currency:'PKR',timezone:'Asia/Karachi'}).returning();const [branch]=await tx.insert(branches).values({clinicId:clinic.id,name:'Main branch'}).returning();const [second]=await tx.insert(branches).values({clinicId:clinic.id,name:'Second branch'}).returning();const [otherClinic]=await tx.insert(clinics).values({name:'Other clinic',currency:'PKR',timezone:'Asia/Karachi'}).returning();
 const person=async(name:string,branchIds:string[],permissions:string[])=>{const authUserId=randomUUID();const [user]=await tx.insert(appUsers).values({authUserId,displayName:name}).returning();const [member]=await tx.insert(memberships).values({clinicId:clinic.id,userId:user.id}).returning();if(branchIds.length)await tx.insert(membershipBranches).values(branchIds.map(branchId=>({clinicId:clinic.id,membershipId:member.id,branchId})));if(permissions.length)await tx.insert(membershipGrants).values(permissions.map(permission=>({clinicId:clinic.id,membershipId:member.id,permission})));return {authUserId,member};};
 const admin=await person('Synthetic administrator',[branch.id,second.id],['appointment.read','appointment.write','patient.demographics.read','schedule.configure']);const reader=await person('Synthetic receptionist',[branch.id],['appointment.read']);const dentistStaff=await person('Synthetic dentist',[branch.id],[]);const elsewhere=await person('Second-branch dentist',[second.id],[]);
 const scope={authUserId:admin.authUserId,clinicId:clinic.id,branchId:branch.id};const readerScope={...scope,authUserId:reader.authUserId};
 const [patient]=await tx.insert(patients).values({creationHash:'synthetic',creationKey:randomUUID(),clinicId:clinic.id,displayId:'SYNTHETIC',name:'Synthetic patient',phone:'+92 300 0000000',phoneNormalized:'923000000000'}).returning();
 const today=businessDate(clinic.timezone);const future=new Date(Date.parse(today)+3*86400000).toISOString().slice(0,10);const past=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
 await tx.execute(sql`set local role clinic_runtime`);
 // Dentists: idempotent creation, case-insensitive names, staff links limited to active branch staff.
 const dentist={kind:'dentist',operationId:randomUUID(),name:'Dr. Synthetic',color:'#185d55',membershipId:dentistStaff.member.id};
 const created=await createScheduleResource(tx,scope,dentist);assert.equal((await createScheduleResource(tx,scope,dentist)).id,created.id);
 await assert.rejects(createScheduleResource(tx,scope,{...dentist,color:'#6784a7'}),status(409));
 await assert.rejects(createScheduleResource(tx,scope,{...dentist,operationId:randomUUID(),name:'dr. SYNTHETIC',membershipId:null}),status(409));
 await assert.rejects(createScheduleResource(tx,scope,{...dentist,operationId:randomUUID(),name:'Second dentist'}),status(409));
 await assert.rejects(createScheduleResource(tx,scope,{...dentist,operationId:randomUUID(),name:'Other branch dentist',membershipId:elsewhere.member.id}),status(400));
 await assert.rejects(createScheduleResource(tx,readerScope,{...dentist,operationId:randomUUID(),name:'Reader dentist',membershipId:null}),status(403));
 const update={kind:'dentist',operationId:randomUUID(),expectedVersion:1,name:'Dr. Synthetic Renamed',color:'#8a5a9e',membershipId:null,active:false};
 assert.equal((await updateScheduleResource(tx,scope,created.id,update)).version,2);assert.equal((await updateScheduleResource(tx,scope,created.id,update)).version,2);
 await assert.rejects(updateScheduleResource(tx,scope,created.id,{...update,operationId:randomUUID()}),status(409));
 await assert.rejects(updateScheduleResource(tx,{...scope,branchId:second.id},created.id,{...update,operationId:randomUUID(),expectedVersion:2}),status(404));
 // Chairs.
 const chair=await createScheduleResource(tx,scope,{kind:'chair',operationId:randomUUID(),name:'Chair 1'});await createScheduleResource(tx,{...scope,branchId:second.id},{kind:'chair',operationId:randomUUID(),name:'Chair 1'});
 await assert.rejects(updateScheduleResource(tx,scope,chair.id,{kind:'dentist',operationId:randomUUID(),expectedVersion:1,name:'Chair 1',color:'#185d55',membershipId:null,active:true}),status(404));
 assert.equal((await updateScheduleResource(tx,scope,chair.id,{kind:'chair',operationId:randomUUID(),expectedVersion:1,name:'Chair A',active:true})).version,2);
 // Opening hours: optimistic versions starting from "not configured".
 const hours={operationId:randomUUID(),expectedVersion:0,slotMinutes:15,weeklyHours:{...emptyWeek,'1':[['09:00','13:00'],['14:00','20:00']]}};
 assert.equal((await saveOpeningHours(tx,scope,hours)).version,1);assert.equal((await saveOpeningHours(tx,scope,hours)).version,1);
 await assert.rejects(saveOpeningHours(tx,scope,{...hours,operationId:randomUUID()}),status(409));
 await assert.rejects(saveOpeningHours(tx,scope,{...hours,operationId:randomUUID(),expectedVersion:1,weeklyHours:{...emptyWeek,'1':[['09:00','13:00'],['12:00','14:00']]}}),status(400));
 assert.equal((await saveOpeningHours(tx,scope,{...hours,operationId:randomUUID(),expectedVersion:1,slotMinutes:30})).version,2);
 // Closed dates report existing bookings and never cancel them.
 await bookAppointment(tx,scope,{patientId:patient.id,operationId:randomUUID(),startsAt:`${future}T10:00:00+05:00`,endsAt:`${future}T10:30:00+05:00`});
 await assert.rejects(addClosure(tx,scope,{operationId:randomUUID(),closedOn:past,reason:'Past holiday'}),status(400));
 const closure={operationId:randomUUID(),closedOn:future,reason:'Synthetic holiday'};const closed=await addClosure(tx,scope,closure);assert.equal(closed.existingBookings,1);assert.equal((await addClosure(tx,scope,closure)).id,closed.id);
 await assert.rejects(addClosure(tx,scope,{...closure,operationId:randomUUID()}),status(409));
 assert.deepEqual([...(await openingRules(tx,scope,today,future)).closedDates],[future]);
 const appointments=await tx.execute<{status:string}>(sql`select status from clinic_app.appointments where clinic_id=${clinic.id}`);assert.deepEqual(appointments.map(r=>r.status),['booked']);
 assert.equal((await cancelClosure(tx,scope,closed.id,{operationId:randomUUID(),expectedVersion:1})).version,2);
 await assert.rejects(cancelClosure(tx,scope,closed.id,{operationId:randomUUID(),expectedVersion:2}),status(409));
 assert.equal((await addClosure(tx,scope,{...closure,operationId:randomUUID()})).version,1);
 // Reads: readers see configuration without staff lists; other branches and clinics stay isolated.
 const view=await getScheduleSettings(tx,readerScope);assert.equal(view.canConfigure,false);assert.equal(view.staff.length,0);assert.equal(view.dentists.length,1);assert.equal(view.dentists[0].active,false);assert.equal(view.chairs[0].name,'Chair A');assert.equal(view.hours?.slotMinutes,30);assert.equal(view.closures.length,1);
 assert.equal((await getScheduleSettings(tx,scope)).staff.length,3);
 const secondView=await getScheduleSettings(tx,{...scope,branchId:second.id});assert.equal(secondView.dentists.length,0);assert.equal(secondView.hours,null);assert.equal(secondView.chairs.length,1);
 await assert.rejects(getScheduleSettings(tx,{...scope,clinicId:otherClinic.id}),status(403));
 // Audit write failure rolls back the configuration change.
 await tx.execute(sql`reset role`);await tx.execute(sql`revoke insert on clinic_app.audit_events from clinic_runtime`);await tx.execute(sql`set local role clinic_runtime`);
 await assert.rejects(createScheduleResource(tx,scope,{kind:'chair',operationId:randomUUID(),name:'Chair B'}));
 await tx.execute(sql`reset role`);await tx.execute(sql`grant insert on clinic_app.audit_events to clinic_runtime`);
 const chairs=await tx.execute<{count:string}>(sql`select count(*)::text as count from clinic_app.schedule_chairs where clinic_id=${clinic.id} and branch_id=${branch.id}`);assert.equal(chairs[0].count,'1');
 const revisions=await tx.execute<{count:string}>(sql`select count(*)::text as count from clinic_app.schedule_config_revisions where clinic_id=${clinic.id}`);assert.equal(revisions[0].count,'10');
 const audits=await tx.execute<{count:string}>(sql`select count(*)::text as count from clinic_app.audit_events where clinic_id=${clinic.id} and entity_type like 'schedule_%'`);assert.equal(audits[0].count,'10');
 // Revision history is immutable even for the migration owner; runtime cannot delete configuration.
 for(const query of [sql`update clinic_app.schedule_config_revisions set snapshot='{}'::jsonb where clinic_id=${clinic.id}`,sql`delete from clinic_app.schedule_config_revisions where clinic_id=${clinic.id}`,sql`truncate clinic_app.schedule_config_revisions`])await assert.rejects(tx.transaction(async nested=>{await nested.execute(query);}));
 await tx.execute(sql`set local role clinic_runtime`);await assert.rejects(tx.transaction(async nested=>{await nested.execute(sql`delete from clinic_app.schedule_dentists where id=${created.id}`);}));
 await tx.execute(sql`reset role`);await tx.execute(sql`delete from clinic_app.membership_grants where membership_id=${admin.member.id} and permission='schedule.configure'`);await tx.execute(sql`set local role clinic_runtime`);
 await assert.rejects(saveOpeningHours(tx,scope,{...hours,operationId:randomUUID(),expectedVersion:2}),status(403));
 throw rollback;
 });}catch(e){if(e!==rollback)throw e;}console.log('Scheduling setup integration passed: dentist/chair/hours/closure versions, retries, name and staff-link rules, branch/clinic isolation, existing-booking reports, immutable revisions, permission checks and audit rollback. Fixtures rolled back.');}catch(e){console.error('Scheduling setup integration failed.',e instanceof assert.AssertionError?e.message:e instanceof AppError?e.code:e);process.exitCode=1;}finally{await client.end();}

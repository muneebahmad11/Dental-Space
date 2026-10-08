import './load-env.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { migrationEnvironment,requireLocalDatabase,connectionOptions } from '../src/lib/config/environment.ts';
import { businessDate } from '../src/lib/finance/contracts.ts';
import { clinics,branches,appUsers,memberships,membershipBranches } from '../src/server/db/schema/organization.ts';
import { membershipGrants } from '../src/server/db/schema/security.ts';
import { patients } from '../src/server/db/schema/patients.ts';
import { addClosure,createScheduleResource,saveOpeningHours,updateScheduleResource } from '../src/server/scheduling/settings.ts';
import { createProcedure } from '../src/server/procedures/service.ts';
import { appointmentHistory,bookAppointment,changeAppointmentStatus,listAppointments,registerWalkIn,rescheduleAppointment,updateAppointmentDetails } from '../src/server/appointments/service.ts';
import { createVisit } from '../src/server/visits/service.ts';
import { AppError } from '../src/server/http/errors.ts';
const {MIGRATION_DATABASE_URL:url}=migrationEnvironment(process.env);requireLocalDatabase(url);const client=postgres(url,{...connectionOptions(url),max:1});const rollback=new Error('ROLLBACK_FIXTURES');
const status=(n:number,code?:string)=>(e:unknown)=>e instanceof AppError&&e.status===n&&(!code||e.code===code);
try{try{await drizzle(client).transaction(async tx=>{
 await tx.execute(sql`select pg_advisory_xact_lock(73492012)`);
 const [clinic]=await tx.insert(clinics).values({name:'Synthetic appointments',currency:'PKR',timezone:'Asia/Karachi'}).returning();const [branch]=await tx.insert(branches).values({clinicId:clinic.id,name:'Main branch'}).returning();const [second]=await tx.insert(branches).values({clinicId:clinic.id,name:'Second branch'}).returning();
 const person=async(name:string,permissions:string[])=>{const authUserId=randomUUID();const [user]=await tx.insert(appUsers).values({authUserId,displayName:name}).returning();const [member]=await tx.insert(memberships).values({clinicId:clinic.id,userId:user.id}).returning();await tx.insert(membershipBranches).values([branch,second].map(b=>({clinicId:clinic.id,membershipId:member.id,branchId:b.id})));await tx.insert(membershipGrants).values(permissions.map(permission=>({clinicId:clinic.id,membershipId:member.id,permission})));return {clinicId:clinic.id,branchId:branch.id,authUserId};};
 const basic=['appointment.read','appointment.write','patient.demographics.read'];
 const admin=await person('Synthetic manager',[...basic,'appointment.override','appointment.duration.override','schedule.configure','procedure.configure','patient.clinical.read','visit.draft.write']);const desk=await person('Synthetic receptionist',basic);
 const patient=async(name:string)=>(await tx.insert(patients).values({creationHash:'synthetic',creationKey:randomUUID(),clinicId:clinic.id,displayId:name.toUpperCase().replace(/\W/g,''),name,phone:'+92 300 0000000',phoneNormalized:'923000000000'}).returning())[0];
 const [amina,bilal,sara,omar]=await Promise.all(['Amina','Bilal','Sara','Omar'].map(patient));
 const today=businessDate(clinic.timezone);const day=(offset:number)=>new Date(Date.parse(today)+offset*86400000).toISOString().slice(0,10);const future=day(7);const at=(d:string,time:string)=>`${d}T${time}:00+05:00`;
 await tx.execute(sql`set local role clinic_runtime`);
 // Branch setup: two dentists, one chair, open 09:00–17:00 every day, a closed date and a 30-minute consultation.
 const op=()=>randomUUID();
 const drA=(await createScheduleResource(tx,admin,{kind:'dentist',operationId:op(),name:'Dr. A',color:'#185d55'})).id;const drB=(await createScheduleResource(tx,admin,{kind:'dentist',operationId:op(),name:'Dr. B',color:'#6784a7'})).id;const retired=await createScheduleResource(tx,admin,{kind:'dentist',operationId:op(),name:'Dr. Retired',color:'#b0703c'});
 await updateScheduleResource(tx,admin,retired.id,{kind:'dentist',operationId:op(),expectedVersion:1,name:'Dr. Retired',color:'#b0703c',membershipId:null,active:false});
 const chair=(await createScheduleResource(tx,admin,{kind:'chair',operationId:op(),name:'Chair 1'})).id;
 const open=[['09:00','17:00']];await saveOpeningHours(tx,admin,{operationId:op(),expectedVersion:0,slotMinutes:15,weeklyHours:{'1':open,'2':open,'3':open,'4':open,'5':open,'6':open,'7':open}});
 await addClosure(tx,admin,{operationId:op(),closedOn:day(8),reason:'Synthetic holiday'});
 const consult=(await createProcedure(tx,admin,{operationId:op(),code:'',name:'Consultation',category:'Consultation',defaultMinutes:30,price:null})).id;
 // Booking rules.
 const slot=(d:string,from:string,to:string)=>({startsAt:at(d,from),endsAt:at(d,to)});
 await assert.rejects(bookAppointment(tx,desk,{operationId:op(),patientId:amina.id,...slot(future,'10:00','10:30')}),status(400,'DENTIST_REQUIRED'));
 await assert.rejects(bookAppointment(tx,desk,{operationId:op(),patientId:amina.id,dentistId:retired.id,...slot(future,'10:00','10:30')}),status(404,'DENTIST_UNAVAILABLE'));
 const first={operationId:op(),patientId:amina.id,dentistId:drA,procedureId:consult,reason:'Tooth pain',...slot(future,'10:00','10:30')};
 const a1=await bookAppointment(tx,desk,first);assert.equal((await bookAppointment(tx,desk,first)).id,a1.id);await assert.rejects(bookAppointment(tx,desk,{...first,reason:'Changed'}),status(409,'OPERATION_CONFLICT'));
 const overlapping={operationId:op(),patientId:bilal.id,dentistId:drA,...slot(future,'10:15','10:45')};
 await assert.rejects(bookAppointment(tx,desk,overlapping),(e:unknown)=>e instanceof AppError&&e.code==='SLOT_CONFLICT'&&e.message.includes('10:00–10:30'));
 await assert.rejects(bookAppointment(tx,desk,{...overlapping,override:{reason:'Emergency squeeze-in'}}),status(403,'OVERRIDE_FORBIDDEN'));
 const squeezed=await bookAppointment(tx,admin,{...overlapping,operationId:op(),override:{reason:'Emergency squeeze-in'}});assert.equal(squeezed.overrideReason,'Emergency squeeze-in');
 await bookAppointment(tx,desk,{operationId:op(),patientId:sara.id,dentistId:drB,...slot(future,'10:00','10:30')});
 await bookAppointment(tx,desk,{operationId:op(),patientId:sara.id,dentistId:drA,chairId:chair,...slot(future,'11:00','11:30')});
 await assert.rejects(bookAppointment(tx,desk,{operationId:op(),patientId:omar.id,dentistId:drB,chairId:chair,...slot(future,'11:15','11:45')}),(e:unknown)=>e instanceof AppError&&e.code==='SLOT_CONFLICT'&&e.message.includes('chair'));
 await assert.rejects(bookAppointment(tx,desk,{operationId:op(),patientId:amina.id,dentistId:drB,...slot(future,'10:15','10:30')}),(e:unknown)=>e instanceof AppError&&e.message.includes('patient'));
 await assert.rejects(bookAppointment(tx,desk,{operationId:op(),patientId:omar.id,dentistId:drB,...slot(future,'16:45','17:15')}),(e:unknown)=>e instanceof AppError&&e.message.includes('outside opening hours'));
 await assert.rejects(bookAppointment(tx,desk,{operationId:op(),patientId:omar.id,dentistId:drB,...slot(day(8),'10:00','10:30')}),(e:unknown)=>e instanceof AppError&&e.message.includes('closed'));
 await bookAppointment(tx,desk,{operationId:op(),patientId:omar.id,dentistId:drB,...slot(future,'10:30','11:00')});
 // Procedure durations are controlled.
 await assert.rejects(bookAppointment(tx,desk,{operationId:op(),patientId:omar.id,dentistId:drB,procedureId:consult,...slot(future,'13:00','13:45')}),status(403,'DURATION_OVERRIDE_FORBIDDEN'));
 const longer=await bookAppointment(tx,admin,{operationId:op(),patientId:omar.id,dentistId:drB,procedureId:consult,...slot(future,'13:00','13:45')});assert.equal((await appointmentHistory(tx,admin,longer.id))[0].detail.durationOverride,true);
 // Lifecycle with immutable history.
 const move=(row:{id:string;version:number},to:string,note='')=>changeAppointmentStatus(tx,desk,row.id,{operationId:op(),expectedVersion:row.version,status:to,note});
 let row=await move(a1,'confirmed');const confirmOp={operationId:op(),expectedVersion:row.version,status:'arrived',note:''};
 row=await changeAppointmentStatus(tx,desk,a1.id,confirmOp);assert.equal((await changeAppointmentStatus(tx,desk,a1.id,confirmOp)).version,row.version);
 await assert.rejects(changeAppointmentStatus(tx,desk,a1.id,{...confirmOp,status:'waiting'}),status(409,'OPERATION_CONFLICT'));
 await assert.rejects(move(row,'completed'),status(409,'INVALID_TRANSITION'));
 row=await move(row,'waiting');row=await move(row,'in_treatment');row=await move(row,'completed');assert.equal(row.status,'completed');assert.equal(row.version,6);
 await assert.rejects(move(row,'arrived'),status(409,'INVALID_TRANSITION'));
 assert.deepEqual((await appointmentHistory(tx,desk,a1.id)).map(e=>[e.version,e.fromStatus,e.toStatus]),[[1,null,'booked'],[2,'booked','confirmed'],[3,'confirmed','arrived'],[4,'arrived','waiting'],[5,'waiting','in_treatment'],[6,'in_treatment','completed']]);
 await assert.rejects(move(squeezed,'cancelled'),status(400,'NOTE_REQUIRED'));await move(squeezed,'cancelled','Patient asked to cancel');
 await assert.rejects(move(longer,'no_show'),status(409,'NOT_STARTED'));
 const missed=await bookAppointment(tx,desk,{operationId:op(),patientId:bilal.id,dentistId:drA,...slot(day(-1),'10:00','10:30')});const noShow=await move(missed,'no_show');
 await assert.rejects(move(noShow,'arrived'),status(400,'NOTE_REQUIRED'));assert.equal((await move(noShow,'arrived','Arrived 20 minutes late')).status,'arrived');
 // Rescheduling keeps identity, records both slots and requires confirmation again.
 const sara2=await bookAppointment(tx,desk,{operationId:op(),patientId:sara.id,dentistId:drB,...slot(future,'14:00','14:30')});const confirmed=await move(sara2,'confirmed');
 const reschedule={operationId:op(),expectedVersion:confirmed.version,dentistId:drA,chairId:null,...slot(future,'15:00','15:30'),note:'Patient prefers later'};
 const moved=await rescheduleAppointment(tx,desk,sara2.id,reschedule);assert.equal(moved.status,'booked');assert.equal(moved.dentistId,drA);assert.equal((await rescheduleAppointment(tx,desk,sara2.id,reschedule)).version,moved.version);
 const last=(await appointmentHistory(tx,desk,sara2.id)).at(-1)!;assert.equal(last.kind,'rescheduled');assert.equal(last.detail.previousStartsAt,new Date(at(future,'14:00')).toISOString());assert.equal(last.detail.previousDentistId,drB);
 await assert.rejects(rescheduleAppointment(tx,desk,sara2.id,{...reschedule,operationId:op(),expectedVersion:moved.version}),status(400,'NO_CHANGE'));
 await assert.rejects(rescheduleAppointment(tx,desk,sara2.id,{...reschedule,operationId:op(),expectedVersion:moved.version,...slot(future,'11:00','11:30')}),status(409,'SLOT_CONFLICT'));
 await assert.rejects(rescheduleAppointment(tx,desk,a1.id,{...reschedule,operationId:op(),expectedVersion:6}),status(409,'NOT_RESCHEDULABLE'));
 const detailed=await updateAppointmentDetails(tx,desk,sara2.id,{operationId:op(),expectedVersion:moved.version,procedureId:consult,reason:'Check-up',notes:'Prefers afternoons',nextAction:'Call to confirm the day before'});assert.equal(detailed.nextAction,'Call to confirm the day before');
 // Walk-ins arrive immediately and queue even when the dentist is busy.
 const walkIn={operationId:op(),patientId:omar.id,dentistId:drA,minutes:30,reason:'Broken filling'};
 const walked=await registerWalkIn(tx,desk,walkIn);assert.equal(walked.status,'arrived');assert.equal(walked.source,'walk_in');assert.equal((await registerWalkIn(tx,desk,walkIn)).id,walked.id);
 // Starting the clinical visit moves the appointment into treatment in the same transaction.
 const visit=await createVisit(tx,admin,{patientId:omar.id,appointmentId:walked.id,operationId:op()});
 const [afterVisit]=(await listAppointments(tx,desk,{startsAt:new Date(Date.now()-86400000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),patientId:omar.id})).filter(r=>r.id===walked.id);
 assert.equal(afterVisit.status,'in_treatment');assert.equal((await appointmentHistory(tx,desk,walked.id)).at(-1)!.detail.visitId,visit.id);
 // Listing joins resource names; other branches see nothing and cannot act on this branch's bookings.
 const list=await listAppointments(tx,desk,{startsAt:at(future,'00:00'),endsAt:at(day(8),'00:00')});assert.equal(list.length,7);assert.equal(list.find(r=>r.id===a1.id)?.dentistName,'Dr. A');assert.equal(list.find(r=>r.id===a1.id)?.procedureName,'Consultation');
 assert.equal((await listAppointments(tx,desk,{startsAt:at(future,'00:00'),endsAt:at(day(8),'00:00'),dentistId:drB})).length,3);
 const other={...desk,branchId:second.id};assert.equal((await listAppointments(tx,other,{startsAt:at(future,'00:00'),endsAt:at(day(8),'00:00')})).length,0);
 await assert.rejects(changeAppointmentStatus(tx,other,sara2.id,{operationId:op(),expectedVersion:detailed.version,status:'confirmed'}),status(404));await assert.rejects(appointmentHistory(tx,other,sara2.id),status(404));
 await assert.rejects(bookAppointment(tx,other,{operationId:op(),patientId:amina.id,dentistId:drA,...slot(future,'09:00','09:30')}),status(404,'DENTIST_UNAVAILABLE'));
 // Audit failure rolls back the booking; history is immutable.
 await tx.execute(sql`reset role`);await tx.execute(sql`revoke insert on clinic_app.audit_events from clinic_runtime`);await tx.execute(sql`set local role clinic_runtime`);
 await assert.rejects(bookAppointment(tx,desk,{operationId:op(),patientId:amina.id,dentistId:drB,...slot(future,'16:00','16:30')}));
 await tx.execute(sql`reset role`);await tx.execute(sql`grant insert on clinic_app.audit_events to clinic_runtime`);
 const count=await tx.execute<{count:string}>(sql`select count(*)::text as count from clinic_app.appointments where clinic_id=${clinic.id}`);assert.equal(count[0].count,'9');
 for(const query of [sql`update clinic_app.appointment_events set detail='{}'::jsonb where clinic_id=${clinic.id}`,sql`delete from clinic_app.appointment_events where clinic_id=${clinic.id}`,sql`truncate clinic_app.appointment_events`])await assert.rejects(tx.transaction(async nested=>{await nested.execute(query);}));
 await tx.execute(sql`delete from clinic_app.membership_grants where permission='appointment.write' and clinic_id=${clinic.id}`);await tx.execute(sql`set local role clinic_runtime`);
 await assert.rejects(registerWalkIn(tx,desk,{...walkIn,operationId:op()}),status(403));
 throw rollback;
 });}catch(e){if(e!==rollback)throw e;}console.log('Appointment lifecycle integration passed: dentist/chair/patient/hours/closure conflicts, audited overrides, controlled durations, full status flow and corrections, rescheduling history, details, walk-ins, visit start, branch isolation, immutable history and audit rollback. Fixtures rolled back.');}catch(e){console.error('Appointment lifecycle integration failed.',e instanceof assert.AssertionError?e.message:e instanceof AppError?`${e.code}: ${e.message}`:e);process.exitCode=1;}finally{await client.end();}

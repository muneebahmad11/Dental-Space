import './load-env.ts';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import type { Database } from '../src/server/auth/context.ts';
import { z } from 'zod';
import { runtimeEnvironment,requireLocalDatabase,connectionOptions } from '../src/lib/config/environment.ts';
import { businessDate } from '../src/lib/finance/contracts.ts';
import { addDays,clockMinutes,localParts,minutesToClock,zonedInstant,type WeeklyHours } from '../src/lib/scheduling/contracts.ts';
import { createScheduleResource,saveOpeningHours,addClosure } from '../src/server/scheduling/settings.ts';
import { createProcedure } from '../src/server/procedures/service.ts';
import { createPatient } from '../src/server/patients/service.ts';
import { savePatientProfile } from '../src/server/patient-profile/service.ts';
import { saveContactPreferences } from '../src/server/patient-profile/contact.ts';
import { savePatientHistory,createPatientAlert } from '../src/server/patient-clinical/service.ts';
import { bookAppointment,changeAppointmentStatus,registerWalkIn } from '../src/server/appointments/service.ts';
import { createVisit,readVisit,saveVisitDraft,signVisit } from '../src/server/visits/service.ts';
import { createPlan,acceptPlan,readPlan } from '../src/server/plans/service.ts';
import { completeTreatment,billTreatment } from '../src/server/plans/completion.ts';
import { postCharge,postPayment,postRefund } from '../src/server/finance/service.ts';
import { recordExpense } from '../src/server/expenses/service.ts';
import { createFollowUp } from '../src/server/follow-ups/service.ts';
import { AppError } from '../src/server/http/errors.ts';
// Fills the LOCAL development database with clearly fictional demo records through the normal services,
// so every record is validated, versioned and audited exactly as in real use. Phones use the 0300-555 range.
// Usage: pnpm db:seed-demo <verified-auth-user-uuid>
const authUserId=z.uuid().parse(process.argv[2]);
const {DATABASE_URL:url}=runtimeEnvironment(process.env);requireLocalDatabase(url);
const client=postgres(url,{...connectionOptions(url),max:1});const dryRun=process.argv.includes('--dry-run');
type Row={id:string;version:number;status:string};
async function main(db:Database){
 const scopes=await db.execute(sql`select m.id as membership_id,m.clinic_id,b.branch_id,c.timezone from clinic_app.app_users u join clinic_app.memberships m on m.user_id=u.id join clinic_app.membership_branches b on b.membership_id=m.id and b.clinic_id=m.clinic_id join clinic_app.clinics c on c.id=m.clinic_id where u.auth_user_id=${authUserId} and u.active and m.active`);
 if(scopes.length!==1)throw new Error('Expected exactly one active branch membership for this account.');
 const {membership_id:membershipId,clinic_id:clinicId,branch_id:branchId,timezone}=scopes[0] as {membership_id:string;clinic_id:string;branch_id:string;timezone:string};
 const [existing]=await db.execute<{count:number}>(sql`select count(*)::int as count from clinic_app.schedule_dentists where clinic_id=${clinicId} and branch_id=${branchId}`);
 if(existing.count>0)throw new Error('ALREADY_SEEDED');
 const s={authUserId,clinicId,branchId};const today=businessDate(timezone);const now=Date.now();
 // Stable operation keys: an interrupted run can be repeated the same day without duplicating anything.
 const op=(key:string)=>{const h=createHash('sha256').update(`demo-seed:${clinicId}:${today}:${key}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
 const log=(m:string)=>console.log(`  ✓ ${m}`);
 // Branch setup.
 const shift=[['10:00','14:00'],['17:00','21:00']] as [string,string][];
 const hours:WeeklyHours={'1':shift,'2':shift,'3':shift,'4':shift,'5':shift,'6':[['10:00','14:00']],'7':[]};
 await saveOpeningHours(db,s,{operationId:op('hours'),expectedVersion:0,slotMinutes:15,weeklyHours:hours});
 const dentists:string[]=[];
 for(const [i,[name,color,linked]] of ([['Dr. Sana Malik','#185d55',true],['Dr. Bilal Ahmed','#6784a7',false],['Dr. Hina Qureshi','#8a5a9e',false]] as const).entries())dentists.push((await createScheduleResource(db,s,{kind:'dentist',operationId:op(`dentist${i}`),name,color,membershipId:linked?membershipId:null})).id);
 const chairs:string[]=[];for(const n of [1,2])chairs.push((await createScheduleResource(db,s,{kind:'chair',operationId:op(`chair${n}`),name:`Chair ${n}`})).id);
 await addClosure(db,s,{operationId:op('closure'),closedOn:addDays(today,12),reason:'Demo public holiday'});
 log('3 dentists, 2 chairs, opening hours (Mon–Fri 10–2 & 5–9, Sat 10–2) and a holiday');
 const catalog:[string,string,number,string|null][]=[['Consultation','Consultation',30,'1500.00'],['Child check-up','Pediatric',20,'1000.00'],['IOPA X-ray','Diagnostic',10,'800.00'],['Scaling and polishing','Preventive',45,'4000.00'],['Composite filling','Restorative',45,'5000.00'],['Root canal (anterior)','Endodontic',60,'15000.00'],['Root canal (molar)','Endodontic',90,'25000.00'],['Simple extraction','Oral surgery',30,'3000.00'],['Surgical extraction','Oral surgery',60,'12000.00'],['PFM crown','Prosthodontic',60,'20000.00'],['Zirconia crown','Prosthodontic',60,'35000.00'],['Teeth whitening','Cosmetic',60,'25000.00'],['Orthodontic consultation','Orthodontic',30,'2500.00'],['Orthodontic adjustment','Orthodontic',30,'5000.00'],['Implant consultation','Implant',30,'3000.00']];
 const procs:Record<string,{id:string;minutes:number;price:string|null}>={};
 for(const [i,[name,category,minutes,price]] of catalog.entries())procs[name]={id:(await createProcedure(db,s,{operationId:op(`proc${i}`),code:'',name,category,defaultMinutes:minutes,price})).id,minutes,price};
 log(`${catalog.length} procedures with default durations and PKR prices`);
 // Patients: fictional names, 0300-555 phones, two family members sharing a phone.
 const people:[string,string,string,string|null,string][]=[['Ayesha Khan','F','1988-04-12',null,'0001'],['Usman Tariq','M','1979-11-03',null,'0002'],['Fatima Noor','F','1995-07-21',null,'0003'],['Hamza Siddiqui','M','2001-02-15',null,'0004'],['Zainab Raza','F','1969-09-30',null,'0005'],['Ali Hassan','M','1984-06-08',null,'0006'],['Maryam Iqbal','F','1992-12-01',null,'0007'],['Omar Farooq','M','1975-03-27',null,'0008'],['Sadia Batool','F','1999-08-19',null,'0009'],['Bilal Chaudhry','M','1990-01-05',null,'0010'],['Hira Shah','F','1986-05-14',null,'0011'],['Imran Butt','M','1964-10-22',null,'0012'],['Noor Fatima','F','2014-03-09','Ayesha Khan','0001'],['Ahmed Khan','M','2011-06-17','Ayesha Khan','0001'],['Rabia Anwar','F','1997-11-28',null,'0013'],['Kamran Akhtar','M','1981-04-02',null,'0014'],['Sana Javed','F','1993-02-11',null,'0015'],['Tariq Mehmood','M','1958-07-07',null,'0016'],['Mehwish Ali','F','1989-09-23',null,'0017'],['Faisal Rehman','M','1977-12-30',null,'0018'],['Amna Yousaf','F','2003-05-06',null,'0019'],['Danish Malik','M','1996-08-13',null,'0020'],['Saima Riaz','F','1972-01-25',null,'0021'],['Junaid Asghar','M','1987-10-10',null,'0022'],['Nida Hussain','F','1991-06-29',null,'0023'],['Waqas Saleem','M','1983-03-18',null,'0024'],['Komal Arif','F','2000-04-04',null,'0025'],['Shahid Latif','M','1969-02-20',null,'0026'],['Uzma Kiran','F','1985-11-11',null,'0027'],['Yasir Nawaz','M','1994-09-01',null,'0028'],['Iqra Saeed','F','1998-12-12',null,'0029'],['Adeel Zafar','M','1980-07-16',null,'0030']];
 const patients:Record<string,string>={};
 for(const [i,[name,gender,dob,guardian,phone]] of people.entries()){
  const p=await createPatient(db,s,{operationId:op(`patient${i}`),name,phone:`0300 555 ${phone}`,email:'',...(guardian?{duplicateOverride:{reason:`Child of ${guardian}; shares the family phone`}}:{})}) as {id:string};
  patients[name]=p.id;
  if(i%3===0||guardian)await savePatientProfile(db,s,p.id,{operationId:op(`profile${i}`),expectedVersion:0,reason:'Recorded at registration (demo)',body:{dob,reportedAge:null,ageAsOf:null,gender:gender==='F'?'Female':'Male',address:'Demo Street, Lahore',alternatePhone:'',emergencyName:guardian??'Family contact (demo)',emergencyPhone:guardian?'':'0300 555 9999',emergencyRelationship:guardian?'Parent':'Relative',status:'active'}});
 }
 log(`${people.length} fictional patients (including two children sharing a parent's phone)`);
 const history=(medical:string,allergies:string,medications:string,tobacco='None reported')=>({medicalHistory:medical,dentalHistory:'Routine dental care (demo)',medications,allergies,tobaccoHistory:tobacco,source:'Patient interview (demo)',reviewedOn:today});
 const clinical:[string,ReturnType<typeof history>,[string,'allergy'|'medical'|'medication',string][]][]=[
  ['Zainab Raza',history('Type 2 diabetes, controlled','Penicillin (rash)','Metformin 500 mg twice daily'),[['critical','allergy','Penicillin allergy — rash'],['important','medical','Diabetic — check sugar before surgery']]],
  ['Imran Butt',history('Hypertension; previous heart stent (2019)','None known','Aspirin 75 mg daily, Amlodipine 5 mg'),[['critical','medication','On aspirin — bleeding risk for extractions'],['important','medical','Hypertension — check BP']]],
  ['Usman Tariq',history('No major illness','None known','None','Smokes 10 cigarettes/day'),[]],
  ['Tariq Mehmood',history('Asthma','Ibuprofen (wheezing)','Salbutamol inhaler as needed'),[['important','allergy','Avoid ibuprofen — triggers asthma']]],
  ['Maryam Iqbal',history('Pregnant (2nd trimester)','None known','Prenatal vitamins'),[['important','medical','Pregnant — avoid elective X-rays']]],
 ];
 for(const [i,[name,body,alerts]] of clinical.entries()){
  await savePatientHistory(db,s,patients[name],{operationId:op(`history${i}`),expectedVersion:0,reason:'Initial medical history (demo)',body});
  for(const [j,[severity,type,text]] of alerts.entries())await createPatientAlert(db,s,patients[name],{operationId:op(`alert${i}-${j}`),reason:'Recorded during history review (demo)',body:{type,severity,text,active:true}});
 }
 log('medical histories and alerts for 5 patients');
 const prefs=(overrides:Record<string,unknown>)=>({doNotContact:false,preferredChannel:'whatsapp',channels:{phone:true,sms:false,whatsapp:true,email:false},purposes:{appointment:true,recall:true,billing:true,marketing:false},note:'',source:'in_person',...overrides});
 for(const [i,[name,body]] of ([['Ayesha Khan',prefs({note:'Also manages appointments for her children'})],['Usman Tariq',prefs({preferredChannel:'phone',channels:{phone:true,sms:false,whatsapp:false,email:false},note:'Call after 6 pm'})],['Omar Farooq',prefs({doNotContact:true,preferredChannel:'none',note:'Asked not to be contacted (demo)'})],['Hira Shah',prefs({purposes:{appointment:true,recall:false,billing:true,marketing:false}})]] as const).entries())
  await saveContactPreferences(db,s,patients[name],{operationId:op(`contact${i}`),expectedVersion:0,body,reason:'Patient told reception (demo)'});
 log('contact preferences for 4 patients');
 // Appointments: past days are resolved, today depends on the current time, the coming days are booked/confirmed.
 const weekday=(d:string)=>localParts('UTC',new Date(`${d}T12:00:00Z`)).weekday;
 const slots=(d:string,minutes:number)=>hours[weekday(d)].flatMap(([a,b])=>{const out:string[]=[];for(let m=clockMinutes(a);m+minutes<=clockMinutes(b);m+=30)out.push(minutesToClock(m));return out;});
 const names=Object.keys(patients);let n=0;const counts:Record<string,number>={};
 const move=async(key:string,row:Row,status:string,note='')=>{const r=await changeAppointmentStatus(db,s,row.id,{operationId:op(key),expectedVersion:row.version,status,note}) as Row;counts[status]=(counts[status]??0)+1;return r;};
 const visitBody=(procedure:string)=>({complaint:`Presented for ${procedure.toLowerCase()} (demo)`,history:'See medical history on file',examination:'Oral examination performed; findings recorded (demo)',assessment:`Suitable for ${procedure.toLowerCase()}`,treatment:`${procedure} carried out under routine protocol (demo)`,advice:'Post-treatment instructions given verbally',followUpOn:''});
 const treat=async(key:string,row:Row,patientId:string,procedure:string,paidOn:string)=>{
  await move(`${key}:arrive`,row,'arrived');
  const visit=await createVisit(db,s,{patientId,appointmentId:row.id,operationId:op(`${key}:visit`)}) as Row;
  await saveVisitDraft(db,s,visit.id,{expectedVersion:visit.version,body:visitBody(procedure)});
  let detail=await readVisit(db,s,visit.id);await signVisit(db,s,visit.id,{expectedVersion:detail.visit.version,operationId:op(`${key}:sign`)});
  detail=await readVisit(db,s,visit.id);if(detail.appointment)await move(`${key}:complete`,detail.appointment as Row,'completed');
  const price=procs[procedure]?.price;if(price){await postCharge(db,s,{operationId:op(`${key}:charge`),patientId,description:procedure,amount:price});
   const methods=['Cash','Cash','Card','Bank transfer'] as const;await postPayment(db,s,{operationId:op(`${key}:pay`),patientId,amount:price,method:methods[n%methods.length],paidOn});}
 };
 const daily:[string,number][]=[['Consultation',0],['Scaling and polishing',1],['Composite filling',0],['Child check-up',2],['Simple extraction',1],['Root canal (anterior)',0],['Orthodontic adjustment',2],['IOPA X-ray',1]];
 for(let offset=-3;offset<=6;offset++){
  const d=addDays(today,offset);if(!hours[weekday(d)].length)continue;
  for(let k=0;k<(offset===0?8:5);k++){
   const [procedure,dentist]=daily[(k+offset+8)%daily.length];const minutes=procs[procedure].minutes;const time=slots(d,minutes)[(k*2+dentist)%slots(d,minutes).length];
   const patientId=patients[names[n++%names.length]];const key=`appt${offset}-${k}`;
   const start=zonedInstant(timezone,d,time);const end=new Date(+start+minutes*60000);
   let row:Row;
   try{row=await bookAppointment(db,s,{operationId:op(key),patientId,startsAt:start.toISOString(),endsAt:end.toISOString(),dentistId:dentists[dentist],chairId:chairs[dentist%2],procedureId:procs[procedure].id,reason:procedure,source:k%3===0?'in_person':'phone',nextAction:k===1?'Call the day before to confirm':''}) as Row;}
   catch(e){if(e instanceof AppError&&e.code==='SLOT_CONFLICT')continue;throw e;}
   counts.booked=(counts.booked??0)+1;
   if(+end<now){ // already happened
    if(k===3)await move(`${key}:noshow`,row,'no_show');else if(k===4)await move(`${key}:cancel`,row,'cancelled','Patient called to cancel (demo)');else await treat(key,row,patientId,procedure,d);
   }else if(+start<=now){row=await move(`${key}:arrive`,row,'arrived');if(k%2===0){row=await move(`${key}:wait`,row,'waiting');}}
   else if(offset<=2&&k%2===0)await move(`${key}:confirm`,row,'confirmed');
  }
 }
 if(hours[weekday(today)].length){await registerWalkIn(db,s,{operationId:op('walkin'),patientId:patients['Danish Malik'],dentistId:dentists[1],chairId:null,procedureId:procs['Consultation'].id,minutes:30,reason:'Toothache, no appointment (demo)',notes:''});counts.walk_in=1;}
 log(`appointments across 10 days: ${Object.entries(counts).map(([k,v])=>`${v} ${k.replace('_',' ')}`).join(', ')}`);
 // Treatment plans: estimates accepted, partly completed and billed, with a partial payment.
 const plans:[string,string,[string,string,number][]][]=[['Zainab Raza','Root canal and crown, lower left',[['Root canal (molar)','36',1],['PFM crown','36',1]]],['Kamran Akhtar','Full mouth restoration (phase 1)',[['Scaling and polishing','',1],['Composite filling','14',1],['Composite filling','25',1]]],['Sana Javed','Smile makeover',[['Teeth whitening','',1],['Zirconia crown','11',1]]]];
 for(const [i,[name,title,items]] of plans.entries()){
  const body={title,note:'Discussed options and costs with the patient (demo)',items:items.map(([proc,tooth,quantity],j)=>({id:op(`plan${i}-item${j}`),description:proc,tooth,quantity,unitPrice:procs[proc].price!}))};
  const plan=await createPlan(db,s,{operationId:op(`plan${i}`),patientId:patients[name],body}) as Row;
  if(i===2)continue; // left as an unaccepted estimate
  await acceptPlan(db,s,plan.id,{operationId:op(`plan${i}:accept`),expectedVersion:plan.version,acceptedBy:`${name} (patient)`,evidence:'Verbal agreement at chair-side (demo)'});
  const current=(await readPlan(db,s,plan.id)).plan.version;
  const done=await completeTreatment(db,s,plan.id,{operationId:op(`plan${i}:done`),expectedVersion:current,itemId:body.items[0].id,quantity:1,performedOn:addDays(today,-2),note:'First stage completed (demo)'});
  await billTreatment(db,s,done.id,{operationId:op(`plan${i}:bill`)});
  const half=(Number(procs[items[0][0]].price)/2).toFixed(2);await postPayment(db,s,{operationId:op(`plan${i}:pay`),patientId:patients[name],amount:half,method:'Cash',paidOn:addDays(today,-2)});
 }
 log('3 treatment plans: 2 accepted with first item completed, billed and part-paid; 1 open estimate');
 // A refund, outstanding charges and paid expenses.
 await postCharge(db,s,{operationId:op('refund:charge'),patientId:patients['Rabia Anwar'],description:'Teeth whitening deposit',amount:'10000.00'});
 const deposit=await postPayment(db,s,{operationId:op('refund:pay'),patientId:patients['Rabia Anwar'],amount:'10000.00',method:'Card',paidOn:addDays(today,-3)});
 await postRefund(db,s,deposit.payment.id,{operationId:op('refund'),amount:'5000.00',paidOn:addDays(today,-1),reason:'Treatment reduced after consultation (demo)'});
 await postCharge(db,s,{operationId:op('due1'),patientId:patients['Faisal Rehman'],description:'Surgical extraction',amount:'12000.00'});
 await postPayment(db,s,{operationId:op('due1:pay'),patientId:patients['Faisal Rehman'],amount:'4000.00',method:'Cash',paidOn:addDays(today,-1)});
 await postCharge(db,s,{operationId:op('due2'),patientId:patients['Saima Riaz'],description:'Composite filling',amount:'5000.00'});
 const expenses:[number,string,'Supplies'|'Laboratory'|'Utilities'|'Maintenance'|'Other','Cash'|'Card'|'Bank transfer',string][]=[[-6,'Gloves, masks and disposables','Supplies','Cash','6500.00'],[-5,'Crown lab work (2 units)','Laboratory','Bank transfer','18000.00'],[-4,'Electricity bill','Utilities','Bank transfer','24500.00'],[-3,'Autoclave servicing','Maintenance','Cash','7000.00'],[-2,'Composite and bonding kit','Supplies','Card','15800.00'],[-1,'Tea and refreshments','Other','Cash','1200.00']];
 for(const [i,[offset,description,category,method,amount]] of expenses.entries())await recordExpense(db,s,{operationId:op(`expense${i}`),paidOn:addDays(today,offset),description:`${description} (demo)`,category,method,amount});
 log('charges with outstanding balances, a partial refund and 6 paid expenses');
 // Follow-ups and recalls: overdue, due today and upcoming.
 const followUps:[string,'Post-extraction'|'RCT review'|'Scaling recall'|'Periodic check-up'|'Crown delivery'|'Orthodontic adjustment',number][]=[['Faisal Rehman','Post-extraction',-2],['Zainab Raza','RCT review',0],['Kamran Akhtar','Scaling recall',0],['Ali Hassan','Periodic check-up',5],['Hira Shah','Crown delivery',9],['Amna Yousaf','Orthodontic adjustment',-1],['Tariq Mehmood','Periodic check-up',30]];
 for(const [i,[name,type,offset]] of followUps.entries())await createFollowUp(db,s,{operationId:op(`followup${i}`),patientId:patients[name],visitId:null,type,customType:'',dueOn:addDays(today,offset),assigneeId:i%2===0?membershipId:null,note:'Created by demo seed'});
 log(`${followUps.length} follow-ups and recalls (overdue, today and upcoming)`);
}
const rollback=new Error('DRY_RUN_ROLLBACK');
const run=dryRun?drizzle(client).transaction(async tx=>{await main(tx);throw rollback;}).catch(e=>{if(e!==rollback)throw e;console.log('\nDry run passed: every step succeeded and everything was rolled back.');}):main(drizzle(client)).then(()=>console.log('\nDemo data created. All records are fictional; phones use the 0300 555 range.'));
run
 .catch(e=>{if(e instanceof Error&&e.message==='ALREADY_SEEDED')console.error('Demo data already exists in this branch (dentist calendars found). Nothing was changed.');else console.error('Demo seed failed.',e instanceof AppError?`${e.code}: ${e.message}`:e instanceof Error?e.message:e);process.exitCode=1;})
 .finally(()=>client.end());


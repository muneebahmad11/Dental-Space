import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createResourceInput,emptyWeek,hoursInput,localParts,openingCheck,weeklyHoursSchema } from '../src/lib/scheduling/contracts.ts';
const week={...emptyWeek,'1':[['09:00','13:00'],['14:00','20:00']] as [string,string][]};
test('opening periods must be ordered, non-overlapping and use 24-hour clock times',()=>{
 assert.equal(weeklyHoursSchema.safeParse(week).success,true);
 assert.equal(weeklyHoursSchema.safeParse({...emptyWeek,'1':[['13:00','09:00']]}).success,false);
 assert.equal(weeklyHoursSchema.safeParse({...emptyWeek,'1':[['09:00','13:00'],['12:00','15:00']]}).success,false);
 assert.equal(weeklyHoursSchema.safeParse({...emptyWeek,'1':[['9:00','13:00']]}).success,false);
 assert.equal(weeklyHoursSchema.safeParse({...emptyWeek,'8':[]}).success,false);
 assert.equal(hoursInput.safeParse({operationId:randomUUID(),expectedVersion:0,slotMinutes:7,weeklyHours:week}).success,false);
});
test('clinic-local weekday and minutes come from the clinic timezone, not the server',()=>{
 assert.deepEqual(localParts('Asia/Karachi',new Date('2026-10-11T19:30:00Z')),{date:'2026-10-12',weekday:'1',minute:30});
 assert.equal(localParts('Asia/Karachi',new Date('2026-10-11T12:00:00Z')).weekday,'7');
});
test('bookings must fit inside one opening period on an open date',()=>{
 const at=(time:string)=>new Date(`2026-10-12T${time}+05:00`);const none=new Set<string>();
 assert.equal(openingCheck(week,none,'Asia/Karachi',at('09:00:00'),at('09:30:00')),'open');
 assert.equal(openingCheck(week,none,'Asia/Karachi',at('12:45:00'),at('13:15:00')),'outside_hours');
 assert.equal(openingCheck(week,none,'Asia/Karachi',at('19:45:00'),at('20:00:00')),'open');
 assert.equal(openingCheck(week,none,'Asia/Karachi',at('08:30:00'),at('09:00:00')),'outside_hours');
 assert.equal(openingCheck(week,new Set(['2026-10-12']),'Asia/Karachi',at('09:00:00'),at('09:30:00')),'closed_date');
 assert.equal(openingCheck(null,none,'Asia/Karachi',at('23:00:00'),at('23:30:00')),'not_configured');
 assert.equal(openingCheck(week,none,'Asia/Karachi',new Date('2026-10-13T09:00:00+05:00'),new Date('2026-10-13T09:30:00+05:00')),'outside_hours');
});
test('resource inputs cannot smuggle scope or unknown fields',()=>{
 const dentist={kind:'dentist',operationId:randomUUID(),name:'Dr. Synthetic',color:'#185d55'};
 assert.equal(createResourceInput.safeParse(dentist).success,true);
 assert.equal(createResourceInput.safeParse({...dentist,clinicId:randomUUID()}).success,false);
 assert.equal(createResourceInput.safeParse({...dentist,color:'red'}).success,false);
 assert.equal(createResourceInput.safeParse({kind:'chair',operationId:randomUUID(),name:'Chair 1',color:'#185d55'}).success,false);
});

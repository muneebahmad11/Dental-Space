import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { appointmentStatuses,bookingInput,canTransition,rescheduleInput,statusInput,transitionNeedsNote,walkInInput } from '../src/lib/appointments/contracts.ts';
test('main flow and approved shortcuts are allowed; final states never reopen',()=>{
 const flow=['booked','confirmed','arrived','waiting','in_treatment','completed'] as const;
 for(let i=1;i<flow.length;i++)assert.equal(canTransition(flow[i-1],flow[i]),true,`${flow[i-1]} → ${flow[i]}`);
 assert.equal(canTransition('booked','arrived'),true);assert.equal(canTransition('arrived','in_treatment'),true);
 for(const to of appointmentStatuses){assert.equal(canTransition('completed',to),false);assert.equal(canTransition('cancelled',to),false);}
 assert.equal(canTransition('booked','completed'),false);assert.equal(canTransition('in_treatment','cancelled'),false);assert.equal(canTransition('booked','booked'),false);
});
test('cancellation and late-arrival corrections require a reason',()=>{
 assert.equal(transitionNeedsNote('booked','cancelled'),true);assert.equal(transitionNeedsNote('no_show','arrived'),true);
 assert.equal(transitionNeedsNote('booked','arrived'),false);assert.equal(canTransition('no_show','arrived'),true);assert.equal(canTransition('no_show','booked'),false);
});
test('bookings use whole minutes between 5 minutes and 8 hours and reject unknown fields',()=>{
 const base={operationId:randomUUID(),patientId:randomUUID(),startsAt:'2026-10-12T09:00:00+05:00',endsAt:'2026-10-12T09:30:00+05:00'};
 const parsed=bookingInput.parse(base);assert.equal(parsed.source,'phone');assert.equal(parsed.dentistId,null);assert.equal(parsed.override,null);
 assert.equal(bookingInput.safeParse({...base,endsAt:'2026-10-12T09:04:00+05:00'}).success,false);
 assert.equal(bookingInput.safeParse({...base,endsAt:'2026-10-12T17:01:00+05:00'}).success,false);
 assert.equal(bookingInput.safeParse({...base,startsAt:'2026-10-12T09:00:30+05:00'}).success,false);
 assert.equal(bookingInput.safeParse({...base,status:'completed'}).success,false);
 assert.equal(bookingInput.safeParse({...base,override:{reason:'ok'}}).success,false);
 assert.equal(rescheduleInput.safeParse({...base,expectedVersion:1}).success,false);
 assert.equal(walkInInput.safeParse({operationId:randomUUID(),patientId:randomUUID(),minutes:3}).success,false);
 assert.equal(statusInput.safeParse({operationId:randomUUID(),expectedVersion:1,status:'rescheduled'}).success,false);
});

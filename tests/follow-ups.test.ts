import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { canTransition,createFollowUpInput,dueBucket,followUpMutation,followUpStatuses } from '../src/lib/follow-ups/contracts.ts';
test('due buckets use clinic-local date and all six follow-up states remain distinct',()=>{
 assert.equal(dueBucket('2026-10-07','2026-10-08'),'overdue');assert.equal(dueBucket('2026-10-08','2026-10-08'),'today');assert.equal(dueBucket('2026-10-09','2026-10-08'),'upcoming');assert.equal(followUpStatuses.length,6);
});
test('finished follow-ups cannot reopen and repeating a status is rejected',()=>{
 for(const status of followUpStatuses){assert.equal(canTransition('completed',status),false);assert.equal(canTransition('closed',status),false);assert.equal(canTransition(status,status),false);}assert.equal(canTransition('booked','completed'),true);assert.equal(canTransition('unable_to_reach','due'),true);
});
test('custom types need a label and mutation inputs cannot smuggle identity or patient changes',()=>{
 const values={operationId:randomUUID(),patientId:randomUUID(),type:'Custom',customType:'',dueOn:'2026-10-08',note:'Reviewed plan'};assert.equal(createFollowUpInput.safeParse(values).success,false);assert.equal(createFollowUpInput.safeParse({...values,customType:'Dentist review'}).success,true);
 const change={operationId:randomUUID(),expectedVersion:1,note:'Reached by phone',action:'contact',channel:'Phone',outcome:'Reached'};assert.equal(followUpMutation.safeParse(change).success,true);assert.equal(followUpMutation.safeParse({...change,patientId:randomUUID()}).success,false);
});

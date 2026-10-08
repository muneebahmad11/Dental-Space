import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visibleCategories,timelineQuery,timelineCursor } from '../src/lib/timeline/contracts.ts';
test('timeline clinical and plan/follow-up metadata requires both relevant permissions',()=>{
 assert.deepEqual(visibleCategories(new Set()),[]);assert.deepEqual(visibleCategories(new Set(['patient.demographics.read','billing.read','plan.read','followup.read'])),['demographics','billing']);
 assert.deepEqual(visibleCategories(new Set(['patient.demographics.read','patient.clinical.read','plan.read','followup.read'])),['demographics','clinical','plans','followups']);
});
test('filters reject unknown categories, reverse dates and unsafe cursor shapes',()=>{
 assert.equal(timelineQuery.safeParse({category:'unrestricted'}).success,false);assert.equal(timelineQuery.safeParse({from:'2026-10-08',to:'2026-10-07'}).success,false);assert.equal(timelineCursor.safeParse({at:'2026-10-08T00:00:00.123456Z',key:'charge:00000000-0000-4000-8000-000000000001'}).success,true);assert.equal(timelineCursor.safeParse({at:'now',key:'sql'}).success,false);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clinicalBody,emptyClinicalBody } from '../src/lib/visits/contracts.ts';
test('clinical note dates, unknown fields and total encoded size are bounded',()=>{assert.equal(clinicalBody.safeParse(emptyClinicalBody).success,true);assert.equal(clinicalBody.safeParse({...emptyClinicalBody,followUpOn:'2026-02-30'}).success,false);assert.equal(clinicalBody.safeParse({...emptyClinicalBody,unsupported:'field'}).success,false);const text='界'.repeat(10000);assert.equal(clinicalBody.safeParse({...emptyClinicalBody,complaint:text,history:text,examination:text}).success,false);});

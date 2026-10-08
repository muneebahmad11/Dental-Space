import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizedPatientName,phoneDigits } from '../src/lib/patient-profile/duplicates.ts';
test('matching ignores phone punctuation and name case without guessing identity or country codes',()=>{
 assert.equal(phoneDigits('+92 (300) 123-4567'),'923001234567');assert.equal(normalizedPatientName('  Patient Name '),'patient name');assert.notEqual(phoneDigits('03001234567'),phoneDigits('+92 300 1234567'));
});

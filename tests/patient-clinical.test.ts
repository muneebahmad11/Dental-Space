import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { historyInput,createAlertInput,updateAlertInput } from '../src/lib/patient-clinical/contracts.ts';
test('history permits explicitly unknown blank fields but requires source/date/review reason',()=>{
 const body={medicalHistory:'',dentalHistory:'',medications:'',allergies:'',tobaccoHistory:'',source:'Patient report',reviewedOn:'2026-10-09'};const input={operationId:randomUUID(),expectedVersion:0,reason:'Initial review',body};assert.equal(historyInput.safeParse(input).success,true);for(const patch of [{source:''},{reviewedOn:'2026-02-30'},{medications:'x'.repeat(6001)}])assert.equal(historyInput.safeParse({...input,body:{...body,...patch}}).success,false);
});
test('alerts start active and revisions require attribution/version without extra identity fields',()=>{
 const input={operationId:randomUUID(),reason:'Reviewed report',body:{type:'other',severity:'important',text:'Reported information',active:true}};assert.equal(createAlertInput.safeParse(input).success,true);assert.equal(createAlertInput.safeParse({...input,body:{...input.body,active:false}}).success,false);assert.equal(updateAlertInput.safeParse({...input,expectedVersion:1,body:{...input.body,active:false}}).success,true);assert.equal(updateAlertInput.safeParse({...input,expectedVersion:1,patientId:randomUUID()}).success,false);
});

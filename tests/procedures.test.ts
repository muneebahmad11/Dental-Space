import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createProcedureInput,minorToInput,updateProcedureInput } from '../src/lib/procedures/contracts.ts';
const base={operationId:randomUUID(),code:'RCT-1',name:'Root canal treatment',category:'Endodontic',defaultMinutes:60,price:'15000.50'};
test('prices are exact paisa and optional; durations use 5-minute steps',()=>{
 assert.equal(createProcedureInput.parse(base).price,1500050);
 assert.equal(createProcedureInput.parse({...base,price:null}).price,null);
 for(const price of ['0','15000.555','-5','1e4','1000000'])assert.equal(createProcedureInput.safeParse({...base,price}).success,false);
 for(const defaultMinutes of [0,7,485])assert.equal(createProcedureInput.safeParse({...base,defaultMinutes}).success,false);
 assert.equal(minorToInput(1500050),'15000.50');assert.equal(minorToInput(5),'0.05');assert.equal(minorToInput(null),'');
});
test('catalog inputs reject unknown categories, unsafe codes and scope fields',()=>{
 assert.equal(createProcedureInput.safeParse({...base,category:'Magic'}).success,false);
 assert.equal(createProcedureInput.safeParse({...base,code:'RCT 1'}).success,false);
 assert.equal(createProcedureInput.safeParse({...base,clinicId:randomUUID()}).success,false);
 assert.equal(updateProcedureInput.safeParse({...base,expectedVersion:1}).success,false);
 assert.equal(updateProcedureInput.safeParse({...base,expectedVersion:1,active:false}).success,true);
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { planBodyInput,planSnapshot,acceptPlanInput,completeItemInput } from '../src/lib/plans/contracts.ts';
const item={id:randomUUID(),description:'Reviewed treatment',tooth:'16',quantity:3,unitPrice:'10.01'};
test('estimates calculate quantity prices exactly and keep stable item identity',()=>{
 const result=planSnapshot(planBodyInput.parse({title:'Estimate',note:'',items:[item]}));assert.equal(result.totalMinor,'3003');assert.equal(result.items[0].unitPriceMinor,1001);assert.equal(result.items[0].id,item.id);
});
test('estimates reject duplicate items, fractional quantity and unbounded prices',()=>{
 for(const items of [[item,item],[{...item,quantity:1.5}],[{...item,unitPrice:'1.001'}],[{...item,quantity:101}],[]])assert.equal(planBodyInput.safeParse({title:'Estimate',note:'',items}).success,false);
 assert.equal(acceptPlanInput.safeParse({operationId:randomUUID(),expectedVersion:1,acceptedBy:'Patient',evidence:''}).success,false);
});

test('completion quantities require whole accepted units and a dated explanation',()=>{
 const input={operationId:randomUUID(),expectedVersion:2,itemId:randomUUID(),quantity:1,performedOn:'2026-01-01',note:'Completed as planned'};assert.equal(completeItemInput.safeParse(input).success,true);
 for(const patch of [{quantity:0},{quantity:1.5},{quantity:101},{note:''},{performedOn:'2026-02-30'}])assert.equal(completeItemInput.safeParse({...input,...patch}).success,false);
});

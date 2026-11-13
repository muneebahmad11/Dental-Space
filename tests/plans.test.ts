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

test('estimate discounts come off the total and are shared across billed items by price',async()=>{
 const {discountShare}=await import('../src/lib/plans/contracts.ts');
 const items=[{...item,quantity:2,unitPrice:'4000.00'},{...item,id:randomUUID(),quantity:1,unitPrice:'12000.00'}];
 const snap=planSnapshot(planBodyInput.parse({title:'Estimate',note:'',items,discount:'2000.00',discountReason:'Package',validUntil:'2026-12-31'}));
 assert.deepEqual([snap.subtotalMinor,snap.discountMinor,snap.totalMinor,snap.validUntil],['2000000','200000','1800000','2026-12-31']);
 assert.equal(discountShare(snap,BigInt(800000)),BigInt(80000));assert.equal(discountShare(snap,BigInt(1200000)),BigInt(120000));
 // Rounds to the nearest paisa and always leaves something to pay.
 assert.equal(discountShare({subtotalMinor:'300',discountMinor:'100',totalMinor:'200'},BigInt(100)),BigInt(33));
 assert.equal(discountShare({subtotalMinor:'100',discountMinor:'99',totalMinor:'1'},BigInt(1)),BigInt(0));
 // Old estimates without a discount bill at full price.
 assert.equal(discountShare({totalMinor:'2000000'},BigInt(800000)),BigInt(0));
 const plain=planSnapshot(planBodyInput.parse({title:'Estimate',note:'',items:[item],discount:'',discountReason:'',validUntil:''}));assert.deepEqual([plain.discountMinor,plain.totalMinor,plain.validUntil],['0','3003',undefined]);
 for(const extra of [{discount:'100.00'},{discountReason:'No amount'},{discount:'30.03',discountReason:'Whole estimate'},{validUntil:'2026-02-30'}])assert.equal(planBodyInput.safeParse({title:'Estimate',note:'',items:[item],...extra}).success,false,JSON.stringify(extra));
});

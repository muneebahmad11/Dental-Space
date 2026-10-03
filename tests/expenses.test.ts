import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { expenseInput } from '../src/lib/expenses/input.ts';
const input={operationId:randomUUID(),paidOn:'2026-10-04',description:' Supplies ',category:'Supplies',method:'Cash',amount:'12.30'};
test('expense amounts use exact paisa and normalize descriptions',()=>{assert.equal(expenseInput.parse(input).amount,1230);assert.equal(expenseInput.parse({...input,amount:'0.01'}).amount,1);assert.equal(expenseInput.parse({...input,amount:'999999.99'}).amount,99999999);assert.equal(expenseInput.parse(input).description,'Supplies');});
test('reject invalid dates, fractional paisa and invalid monetary forms',()=>{for(const amount of ['0','-1','1e3','1.001','1000000','NaN','01.20'])assert.equal(expenseInput.safeParse({...input,amount}).success,false);assert.equal(expenseInput.safeParse({...input,paidOn:'2026-02-30'}).success,false);assert.equal(expenseInput.safeParse({...input,description:' '}).success,false);});

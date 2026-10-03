import assert from 'node:assert/strict';
import { test } from 'node:test';
import { amountInput,businessDate,moneyMinor } from '../src/lib/finance/contracts.ts';
test('finance preserves exact decimal minor units and large aggregate formatting',()=>{assert.equal(moneyMinor('-8'),'PKR -0.08');assert.equal(amountInput.parse('0.01'),1);assert.equal(amountInput.parse('999999.99'),99999999);assert.equal(moneyMinor('9007199254740993'),'PKR 90071992547409.93');for(const value of ['0','1e4','-1','1.001','1000000'])assert.equal(amountInput.safeParse(value).success,false);});
test('business dates use the clinic timezone across UTC midnight boundaries',()=>{assert.equal(businessDate('Asia/Karachi',new Date('2026-10-03T20:00:00Z')),'2026-10-04');assert.equal(businessDate('UTC',new Date('2026-10-03T20:00:00Z')),'2026-10-03');});

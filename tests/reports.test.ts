import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cashFlow, reportRange } from '../src/lib/reports/contracts.ts';

test('reports accept at most 366 inclusive days and reject invalid or reversed dates',()=>{
  assert.equal(reportRange.safeParse({from:'2024-01-01',to:'2024-12-31'}).success,true);
  for(const range of [{from:'2024-01-01',to:'2025-01-01'},{from:'2026-10-04',to:'2026-10-03'},{from:'2026-02-30',to:'2026-03-01'}])assert.equal(reportRange.safeParse(range).success,false);
});
test('money movement keeps exact large integers and negative outflows',()=>{
  assert.equal(cashFlow('9007199254740993','3','2').netMovementMinor,'9007199254740988');
  assert.equal(cashFlow('0','123','125').netMovementMinor,'-248');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLedger, postCharges, recordPayment } from '../src/lib/demo/billing.ts';
import { addExpense, closeDay, dayTotals, emptyOperations, parseCash, requireOpenDay, type Expense } from '../src/lib/demo/operations.ts';
const date = '2026-09-29';
const expense: Expense = { id: 'expense-1', date, description: 'Demo supplies', category: 'Supplies', method: 'Cash', amount: 25025 };
const charged = postCharges(emptyLedger, 'p1', date, [{ visitId: 'v1', itemId: 'i1', description: 'Consultation', amount: 150000 }]);
const cashPaid = recordPayment(charged, { id: 'p1', patientId: 'p1', patientName: 'Demo', date, amount: 50025, method: 'Cash' }).ledger;
const ledger = recordPayment(cashPaid, { id: 'p2', patientId: 'p1', patientName: 'Demo', date, amount: 99975, method: 'Card' }).ledger;

test('zero is accepted for cash counts but malformed and negative values are rejected', () => {
  for (const zero of ['0', '0.0', '0.00']) assert.equal(parseCash(zero), 0);
  assert.equal(parseCash('100.29'), 10029);
  for (const invalid of ['', '-1', '2.001', '1e3']) assert.equal(parseCash(invalid), null);
});
test('expense posting is idempotent and invalid entries never mutate state', () => {
  const ops = addExpense(emptyOperations, expense);
  assert.equal(addExpense(ops, expense).expenses.length, 1);
  assert.throws(() => addExpense(ops, { ...expense, amount: 1 }), /different details/);
  for (const amount of [0, -1, 1.1, NaN]) assert.throws(() => addExpense(emptyOperations, { ...expense, amount }), /valid positive/);
  assert.throws(() => addExpense(emptyOperations, { ...expense, description: ' ' }), /description/);
  assert.equal(emptyOperations.expenses.length, 0);
});
test('drawer calculation separates noncash methods and excludes other dates', () => {
  let ops = addExpense(emptyOperations, expense);
  ops = addExpense(ops, { ...expense, id: 'bank', method: 'Bank transfer', amount: 10000 });
  ops = addExpense(ops, { ...expense, id: 'other-day', date: '2026-09-28', amount: 70000 });
  assert.deepEqual(dayTotals(ledger, ops, date, 100000), { cashCollected: 50025, cashExpenses: 25025, nonCashCollected: 99975, nonCashExpenses: 10000, expected: 125000 });
});
test('closing records an exact snapshot and requires explanation for discrepancies', () => {
  const ops = addExpense(emptyOperations, expense);
  const input = { date, opening: 100000, counted: 124000, note: '' };
  assert.throws(() => closeDay(ops, ledger, input), /Explain/);
  const closed = closeDay(ops, ledger, { ...input, note: 'Synthetic PKR 10 shortage.' });
  assert.equal(closed.closings[0].expected, 125000);
  assert.equal(closed.closings[0].difference, -1000);
  assert.equal(ops.closings.length, 0);
  assert.equal(closeDay(ops, ledger, { ...input, counted: 125000 }).closings[0].difference, 0);
});
test('closed day rejects new expenses and financial posting guard, but other days stay open', () => {
  const closed = closeDay(emptyOperations, emptyLedger, { date, opening: 0, counted: 0, note: '' });
  assert.throws(() => addExpense(closed, expense), /closed/);
  assert.throws(() => requireOpenDay(closed, date), /closed/);
  assert.throws(() => closeDay(closed, emptyLedger, { date, opening: 0, counted: 0, note: '' }), /closed/);
  assert.doesNotThrow(() => requireOpenDay(closed, '2026-09-30'));
});
test('negative expected cash and invalid cash counts cannot close', () => {
  const ops = addExpense(emptyOperations, expense);
  assert.throws(() => closeDay(ops, emptyLedger, { date, opening: 0, counted: 0, note: 'test' }), /negative/);
  assert.throws(() => closeDay(emptyOperations, emptyLedger, { date, opening: -1, counted: 0, note: '' }), /non-negative/);
});

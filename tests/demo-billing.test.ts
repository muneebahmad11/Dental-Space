import test from 'node:test';
import assert from 'node:assert/strict';
import { accountTotals, emptyLedger, parseAmount, postCharges, recordPayment } from '../src/lib/demo/billing.ts';

const sources = [
  { visitId: 'v1', itemId: 'i1', description: 'Consultation', amount: 150000 },
  { visitId: 'v1', itemId: 'i2', description: 'Filling', amount: 500000 },
];
const input = { id: 'payment-1', patientId: 'p1', patientName: 'Demo patient', date: '2026-09-29', amount: 200000, method: 'Cash' as const };

test('decimal input converts exactly to integer minor units and rejects malformed values', () => {
  assert.equal(parseAmount('0.29'), 29);
  assert.equal(parseAmount('1500.5'), 150050);
  assert.equal(parseAmount('999999.99'), 99999999);
  for (const invalid of ['0', '-2', '1.001', '1e3', 'NaN', 'Infinity', '1,000', '', '1000000']) assert.equal(parseAmount(invalid), null, invalid);
});

test('charges are posted once per source item and prices stay fixed', () => {
  const first = postCharges(emptyLedger, 'p1', input.date, sources);
  const replay = postCharges(first, 'p1', input.date, [{ ...sources[0], amount: 99999 }, ...sources]);
  assert.equal(replay.charges.length, 2);
  assert.equal(accountTotals(replay, 'p1').charged, 650000);
  assert.equal(emptyLedger.charges.length, 0);
  assert.throws(() => postCharges(first, 'p2', input.date, [sources[0]]), /another account/);
});

test('partial payments allocate oldest-first, settle exactly, and retain receipt snapshots', () => {
  const charged = postCharges(emptyLedger, 'p1', input.date, sources);
  const first = recordPayment(charged, input);
  assert.deepEqual(first.payment.allocations.map(a => a.amount), [150000, 50000]);
  assert.deepEqual(accountTotals(first.ledger, 'p1'), { charged: 650000, paid: 200000, balance: 450000 });
  const final = recordPayment(first.ledger, { ...input, id: 'payment-2', amount: 450000 });
  assert.equal(accountTotals(final.ledger, 'p1').balance, 0);
  assert.equal(first.payment.balanceAfter, 450000);
  assert.equal(final.ledger.payments[0].balanceAfter, 450000);
  assert.equal(final.payment.receiptNumber, 'DEMO-00002');
  assert.equal(final.payment.allocations[0].amount, 450000);
  assert.throws(() => recordPayment(final.ledger, { ...input, id: 'payment-3', amount: 1 }), /exceeds/);
});

test('replayed payments do not double-post; changed payload with same key is rejected', () => {
  const charged = postCharges(emptyLedger, 'p1', input.date, sources);
  const first = recordPayment(charged, input);
  const replay = recordPayment(first.ledger, input);
  assert.equal(replay.ledger.payments.length, 1);
  assert.equal(replay.payment.id, first.payment.id);
  assert.throws(() => recordPayment(first.ledger, { ...input, amount: 100000 }), /different details/);
});

test('overpayments, invalid amounts and another patient account are rejected', () => {
  const ledger = postCharges(emptyLedger, 'p1', input.date, sources);
  for (const amount of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => recordPayment(ledger, { ...input, amount }), /valid positive/);
  assert.throws(() => recordPayment(ledger, { ...input, amount: 650001 }), /exceeds/);
  assert.throws(() => recordPayment(ledger, { ...input, patientId: 'p2' }), /exceeds/);
  assert.equal(ledger.payments.length, 0);
});

test('minor-unit fractions reconcile without floating point drift', () => {
  const ledger = postCharges(emptyLedger, 'p1', input.date, [{ ...sources[0], amount: 30 }]);
  const first = recordPayment(ledger, { ...input, amount: 10 });
  const second = recordPayment(first.ledger, { ...input, id: 'penny-2', amount: 20 });
  assert.deepEqual(accountTotals(second.ledger, 'p1'), { charged: 30, paid: 30, balance: 0 });
});

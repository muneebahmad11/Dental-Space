import './load-env.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { migrationEnvironment, requireLocalDatabase, connectionOptions } from '../src/lib/config/environment.ts';
import { clinics, branches, appUsers, memberships, membershipBranches } from '../src/server/db/schema/organization.ts';
import { membershipGrants } from '../src/server/db/schema/security.ts';
import { closingSummary } from '../src/server/closing/service.ts';
import { correctCharge, getReceipt, patientAccount, postCharge, postCreditNote, postPayment, postRefund } from '../src/server/finance/service.ts';
import { createPatient } from '../src/server/patients/service.ts';
import { financeReport } from '../src/server/reports/service.ts';
import { businessDate } from '../src/lib/finance/contracts.ts';
import { AppError } from '../src/server/http/errors.ts';
const { MIGRATION_DATABASE_URL: url } = migrationEnvironment(process.env); requireLocalDatabase(url); const client = postgres(url, { ...connectionOptions(url), max: 1 }); const rollback = new Error('ROLLBACK_FIXTURES');
const status = (n: number) => (e: unknown) => e instanceof AppError && e.status === n; const code = (c: string) => (e: unknown) => e instanceof AppError && e.code === c;
const read = ['patient.demographics.read', 'patient.demographics.write', 'billing.read', 'expense.read', 'closing.read'];
try { try { await drizzle(client).transaction(async tx => {
  await tx.execute(sql`select pg_advisory_xact_lock(73492028)`);
  const [clinic] = await tx.insert(clinics).values({ name: 'Synthetic credits', currency: 'PKR', timezone: 'Asia/Karachi' }).returning(); const [branch] = await tx.insert(branches).values({ clinicId: clinic.id, name: 'Main branch' }).returning(); const [second] = await tx.insert(branches).values({ clinicId: clinic.id, name: 'Second branch' }).returning();
  const [other] = await tx.insert(clinics).values({ name: 'Other clinic', currency: 'PKR', timezone: 'Asia/Karachi' }).returning(); const [otherBranch] = await tx.insert(branches).values({ clinicId: other.id, name: 'Other branch' }).returning();
  const person = async (clinicId: string, branchIds: string[], permissions: string[]) => { const authUserId = randomUUID(); const [user] = await tx.insert(appUsers).values({ authUserId, displayName: 'Synthetic staff' }).returning(); const [member] = await tx.insert(memberships).values({ clinicId, userId: user.id }).returning(); await tx.insert(membershipBranches).values(branchIds.map(branchId => ({ clinicId, membershipId: member.id, branchId }))); await tx.insert(membershipGrants).values(permissions.map(permission => ({ clinicId, membershipId: member.id, permission }))); return { authUserId, clinicId, branchId: branchIds[0] }; };
  const all = [...read, 'charge.post', 'charge.credit', 'payment.post', 'refund.post'];
  const owner = await person(clinic.id, [branch.id, second.id], all); const cashier = await person(clinic.id, [branch.id], [...read, 'charge.post', 'payment.post']); const creditOnly = await person(clinic.id, [branch.id], [...read, 'charge.credit']); const outsider = await person(other.id, [otherBranch.id], all);
  await tx.execute(sql`set local role clinic_runtime`);
  const today = businessDate('Asia/Karachi');
  const patient = await createPatient(tx, owner, { operationId: randomUUID(), name: 'Synthetic Patient', phone: '+92 300 0000000', email: '' });
  const balance = async () => (await patientAccount(tx, owner, patient.id)).balanceMinor;
  const credit = (who: typeof owner, chargeId: string, amount: string, operationId = randomUUID(), reason = 'Agreed reduction') => postCreditNote(tx, who, chargeId, { operationId, amount, reason });

  // Worked example from the plan: charge 10,000, reduction 1,000, payment 4,000 leaves 5,000 due.
  const charge = await postCharge(tx, owner, { operationId: randomUUID(), patientId: patient.id, description: 'Root canal treatment', amount: '10000.00' });
  const discountKey = randomUUID(); const discount = await credit(owner, charge.id, '1000.00', discountKey);
  const payment = await postPayment(tx, owner, { operationId: randomUUID(), patientId: patient.id, amount: '4000.00', method: 'Cash', paidOn: today });
  assert.equal(await balance(), '500000');
  // Refunding 1,000 of that payment without changing the charge leaves 6,000 due.
  await postRefund(tx, owner, payment.payment.id, { operationId: randomUUID(), amount: '1000.00', paidOn: today, reason: 'Synthetic refund' });
  assert.equal(await balance(), '600000');
  // A separate 1,000 service credit brings it back to 5,000 due.
  await credit(owner, charge.id, '1000.00');
  assert.equal(await balance(), '500000');
  const account = await patientAccount(tx, owner, patient.id);
  assert.deepEqual([account.chargedMinor, account.creditedMinor, account.paidMinor, account.creditNotes.length], ['1000000', '200000', '300000', 2]);
  assert.deepEqual([account.charges[0].creditedMinor, account.charges[0].allocatedMinor], ['200000', '300000']);

  // Replay returns the same note; a changed payload with the same key conflicts.
  assert.equal((await credit(owner, charge.id, '1000.00', discountKey)).id, discount.id);
  await assert.rejects(credit(owner, charge.id, '999.00', discountKey), status(409));
  assert.equal(await balance(), '500000');
  // Denial: needs charge.credit; other branches and clinics cannot reach the charge; bad input is refused.
  await assert.rejects(credit(cashier, charge.id, '1.00'), status(403));
  await assert.rejects(credit({ ...owner, branchId: second.id }, charge.id, '1.00'), status(404));
  await assert.rejects(credit(outsider, charge.id, '1.00'), status(404));
  await assert.rejects(credit({ ...outsider, clinicId: clinic.id, branchId: branch.id }, charge.id, '1.00'), status(403));
  await assert.rejects(credit(owner, randomUUID(), '1.00'), status(404));
  for (const bad of [{ amount: '0', reason: 'Zero' }, { amount: '1.00', reason: 'x' }, { amount: '-5', reason: 'Negative' }]) await assert.rejects(postCreditNote(tx, owner, charge.id, { operationId: randomUUID(), ...bad }), status(400));
  // A credit can never exceed the unpaid part of the charge, so the balance cannot go negative.
  await assert.rejects(credit(owner, charge.id, '5000.01'), code('CREDIT_EXCEEDS_OUTSTANDING'));
  // The next payment allocates only against what is still owed after credits.
  await assert.rejects(postPayment(tx, owner, { operationId: randomUUID(), patientId: patient.id, amount: '5000.01', method: 'Cash', paidOn: today }), code('OVERPAYMENT'));
  const settle = await postPayment(tx, owner, { operationId: randomUUID(), patientId: patient.id, amount: '5000.00', method: 'Card', paidOn: today });
  assert.equal(await balance(), '0');
  assert.deepEqual([(await getReceipt(tx, owner, settle.receipt.id)).snapshot.creditedMinor, (await getReceipt(tx, owner, settle.receipt.id)).snapshot.balanceMinor], ['200000', '0']);
  await assert.rejects(credit(owner, charge.id, '1.00'), code('CREDIT_EXCEEDS_OUTSTANDING'));

  // Correction: the wrong charge is fully credited and linked to a replacement; nothing is edited.
  const wrong = await postCharge(tx, owner, { operationId: randomUUID(), patientId: patient.id, description: 'Crown (zirconia)', amount: '30000.00' });
  const fixKey = randomUUID(); const fix = { operationId: fixKey, reason: 'Wrong crown type selected', description: 'Crown (PFM)', amount: '18000.00' };
  await assert.rejects(correctCharge(tx, cashier, wrong.id, fix), status(403));
  await assert.rejects(correctCharge(tx, creditOnly, wrong.id, fix), status(403));
  await assert.rejects(correctCharge(tx, outsider, wrong.id, fix), status(404));
  const correction = await correctCharge(tx, owner, wrong.id, fix);
  assert.equal((await correctCharge(tx, owner, wrong.id, fix)).id, correction.id);
  await assert.rejects(correctCharge(tx, owner, wrong.id, { ...fix, amount: '17000.00' }), status(409));
  assert.equal(correction.amountMinor, 3000000); assert.ok(correction.replacementChargeId);
  assert.equal(await balance(), '1800000');
  await assert.rejects(correctCharge(tx, owner, wrong.id, { ...fix, operationId: randomUUID() }), code('CHARGE_ALREADY_CREDITED'));
  await assert.rejects(correctCharge(tx, owner, charge.id, { ...fix, operationId: randomUUID() }), code('CHARGE_HAS_PAYMENTS'));
  const after = await patientAccount(tx, owner, patient.id);
  assert.equal(after.charges.find(c => c.id === correction.replacementChargeId)?.description, 'Crown (PFM)');
  assert.equal(after.charges.find(c => c.id === wrong.id)?.amountMinor, 3000000);

  // Each payment is allocated only to what a charge still owes, so earlier payments are never counted twice.
  await postPayment(tx, owner, { operationId: randomUUID(), patientId: patient.id, amount: '8000.00', method: 'Card', paidOn: today });
  await postPayment(tx, owner, { operationId: randomUUID(), patientId: patient.id, amount: '10000.00', method: 'Card', paidOn: today });
  const paid = await patientAccount(tx, owner, patient.id); const allocated = (id: string) => paid.charges.find(c => c.id === id)?.allocatedMinor;
  assert.deepEqual([allocated(charge.id), allocated(wrong.id), allocated(correction.replacementChargeId!), paid.balanceMinor], ['800000', '0', '1800000', '0']);
  // Credit notes move no money: closing cash is unchanged and the report shows them apart from cash totals.
  const closing = await closingSummary(tx, owner, today); assert.deepEqual([closing.cashReceiptsMinor, closing.cashRefundsMinor], ['400000', '100000']);
  const report = await financeReport(tx, owner, { from: today, to: today });
  assert.deepEqual([report.creditNotes.count, report.creditNotes.totalMinor, report.totals.receiptsMinor, report.totals.refundsMinor], [3, '3200000', '2700000', '100000']);
  assert.equal((await financeReport(tx, outsider, { from: today, to: today })).creditNotes.count, 0);

  const open = await postCharge(tx, owner, { operationId: randomUUID(), patientId: patient.id, description: 'Open charge', amount: '50.00' });
  // Audit failure rolls the credit note back; posted credit notes cannot be changed or removed.
  await tx.execute(sql`reset role`); await tx.execute(sql`revoke insert on clinic_app.audit_events from clinic_runtime`); await tx.execute(sql`set local role clinic_runtime`);
  await assert.rejects(tx.transaction(n => postCreditNote(n, owner, open.id, { operationId: randomUUID(), amount: '1.00', reason: 'Should roll back' })));
  await tx.execute(sql`reset role`); await tx.execute(sql`grant insert on clinic_app.audit_events to clinic_runtime`);
  assert.equal((await tx.execute<{ count: number }>(sql`select count(*)::int as count from clinic_app.credit_notes where clinic_id=${clinic.id}`))[0].count, 3);
  for (const query of [sql`update clinic_app.credit_notes set amount_minor=1 where clinic_id=${clinic.id}`, sql`delete from clinic_app.credit_notes where clinic_id=${clinic.id}`, sql`truncate clinic_app.credit_notes`]) await assert.rejects(tx.transaction(async n => { await n.execute(query); }));
  const actions = (await tx.execute<{ action: string }>(sql`select action from clinic_app.audit_events where clinic_id=${clinic.id}`)).map(r => r.action);
  assert.equal(actions.filter(a => a === 'charge.credited').length, 2); assert.equal(actions.filter(a => a === 'charge.corrected').length, 1);
  throw rollback;
}); } catch (e) { if (e !== rollback) throw e; } console.log('Credit note integration passed: plan examples (5,000 → 6,000 → 5,000 due), replay and conflict, permission/branch/clinic denial, no negative balance, payment allocation after credits, linked charge correction, closing unaffected, report totals, audit rollback and immutability. Fixtures rolled back.'); }
catch (e) { console.error('Credit note integration failed.', e instanceof assert.AssertionError ? e.message : e instanceof AppError ? e.code : e); process.exitCode = 1; } finally { await client.end(); }

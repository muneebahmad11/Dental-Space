import './load-env.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { migrationEnvironment, requireLocalDatabase, connectionOptions } from '../src/lib/config/environment.ts';
import { clinics, branches, appUsers, memberships, membershipBranches } from '../src/server/db/schema/organization.ts';
import { membershipGrants, membershipRoles, roles } from '../src/server/db/schema/security.ts';
import { listPaymentMethods, readClinicSettings, saveClinicSettings, setPaymentMethod } from '../src/server/clinic/settings.ts';
import { approveClosing, closingSummary, saveClosingDraft } from '../src/server/closing/service.ts';
import { recordExpense } from '../src/server/expenses/service.ts';
import { getReceipt, postCharge, postPayment } from '../src/server/finance/service.ts';
import { createPatient } from '../src/server/patients/service.ts';
import { financeReport } from '../src/server/reports/service.ts';
import { AppError } from '../src/server/http/errors.ts';
const { MIGRATION_DATABASE_URL: url } = migrationEnvironment(process.env); requireLocalDatabase(url); const client = postgres(url, { ...connectionOptions(url), max: 1 }); const rollback = new Error('ROLLBACK_FIXTURES');
const status = (n: number) => (e: unknown) => e instanceof AppError && e.status === n; const code = (c: string) => (e: unknown) => e instanceof AppError && e.code === c;
const money = ['patient.demographics.read', 'patient.demographics.write', 'billing.read', 'charge.post', 'payment.post', 'expense.read', 'expense.write', 'closing.read', 'closing.write', 'closing.approve'];
try { try { await drizzle(client).transaction(async tx => {
  await tx.execute(sql`select pg_advisory_xact_lock(73492027)`);
  const [clinic] = await tx.insert(clinics).values({ name: 'Synthetic settings', currency: 'PKR', timezone: 'Asia/Karachi' }).returning(); const [branch] = await tx.insert(branches).values({ clinicId: clinic.id, name: 'Main branch' }).returning();
  const [other] = await tx.insert(clinics).values({ name: 'Other clinic', currency: 'PKR', timezone: 'Asia/Karachi' }).returning(); const [otherBranch] = await tx.insert(branches).values({ clinicId: other.id, name: 'Other branch' }).returning();
  const [ownerRole] = await tx.insert(roles).values({ clinicId: clinic.id, name: 'owner' }).returning();
  const person = async (clinicId: string, branchId: string, permissions: string[], owner = false) => { const authUserId = randomUUID(); const [user] = await tx.insert(appUsers).values({ authUserId, displayName: 'Synthetic staff' }).returning(); const [member] = await tx.insert(memberships).values({ clinicId, userId: user.id }).returning(); await tx.insert(membershipBranches).values({ clinicId, membershipId: member.id, branchId }); if (permissions.length) await tx.insert(membershipGrants).values(permissions.map(permission => ({ clinicId, membershipId: member.id, permission }))); if (owner) await tx.insert(membershipRoles).values({ clinicId, membershipId: member.id, roleId: ownerRole.id }); return { authUserId, clinicId, branchId }; };
  const owner = await person(clinic.id, branch.id, [...money, 'clinic.configure'], true); const cashier = await person(clinic.id, branch.id, money); const outsider = await person(other.id, otherBranch.id, [...money, 'clinic.configure']);
  await tx.execute(sql`set local role clinic_runtime`);

  // Settings: any member reads, only clinic.configure writes, stale versions are refused, other clinics are untouched.
  const initial = await readClinicSettings(tx, cashier); assert.equal(initial.canConfigure, false); assert.equal(initial.settings.version, 1); assert.equal(initial.settings.closingApprovalPolicy, 'second_approver');
  assert.deepEqual(initial.paymentMethods.map(m => [m.name, m.isCash, m.active]), [['Cash', true, true], ['Card', false, true], ['Bank transfer', false, true], ['Easypaisa', false, true], ['JazzCash', false, true]]);
  const details = { expectedVersion: 1, name: 'Synthetic Smiles', city: 'Lahore', phone: '+92 42 0000000', address: '12 Test Road', receiptHeader: 'Dr. Synthetic, BDS', receiptFooter: 'Thank you', ntn: '1234567-8', closingApprovalPolicy: 'second_approver' };
  await assert.rejects(saveClinicSettings(tx, cashier, details), status(403));
  await assert.rejects(saveClinicSettings(tx, { ...outsider, clinicId: clinic.id, branchId: branch.id }, details), status(403));
  for (const bad of [{ ...details, name: ' ' }, { ...details, closingApprovalPolicy: 'nobody' }, { ...details, phone: 'call me' }, { ...details, status: 'active' }]) await assert.rejects(saveClinicSettings(tx, owner, bad), status(400));
  assert.equal((await saveClinicSettings(tx, owner, details)).version, 2);
  await assert.rejects(saveClinicSettings(tx, owner, details), status(409));
  assert.equal((await readClinicSettings(tx, outsider)).settings.name, 'Other clinic');
  for (const query of [sql`update clinic_app.clinics set status='suspended' where id=${clinic.id}`, sql`update clinic_app.clinics set currency='USD' where id=${clinic.id}`, sql`update clinic_app.clinics set paid_until='2099-01-01' where id=${clinic.id}`, sql`insert into clinic_app.clinic_payment_methods(clinic_id,name) values (${clinic.id},'Cheque')`, sql`update clinic_app.clinic_payment_methods set is_cash=true where clinic_id=${clinic.id}`, sql`delete from clinic_app.clinic_payment_methods where clinic_id=${clinic.id}`])
    await assert.rejects(tx.transaction(async n => { await n.execute(query); }));

  // Payment methods: per clinic, enable/disable only, at least one stays enabled, disabled methods are refused for new money.
  const patient = await createPatient(tx, owner, { operationId: randomUUID(), name: 'Synthetic Patient', phone: '+92 300 0000000', email: '' });
  await postCharge(tx, owner, { operationId: randomUUID(), patientId: patient.id, description: 'Synthetic treatment', amount: '100.00' });
  const pay = (method: string, amount: string) => postPayment(tx, cashier, { operationId: randomUUID(), patientId: patient.id, amount, method, paidOn: '2026-01-01' });
  const first = await pay('Cash', '30.00'); await pay('Easypaisa', '20.00');
  await assert.rejects(pay('Cheque', '1.00'), code('METHOD_UNAVAILABLE'));
  await assert.rejects(setPaymentMethod(tx, cashier, { name: 'Card', active: false }), status(403));
  await assert.rejects(setPaymentMethod(tx, owner, { name: 'Cheque', active: true }), status(404));
  await setPaymentMethod(tx, owner, { name: 'Card', active: false });
  await assert.rejects(pay('Card', '1.00'), code('METHOD_UNAVAILABLE'));
  await assert.rejects(recordExpense(tx, cashier, { operationId: randomUUID(), paidOn: '2026-01-01', description: 'Synthetic supplies', category: 'Supplies', method: 'Card', amount: '1.00' }), code('METHOD_UNAVAILABLE'));
  await recordExpense(tx, cashier, { operationId: randomUUID(), paidOn: '2026-01-01', description: 'Synthetic supplies', category: 'Supplies', method: 'JazzCash', amount: '5.00' });
  await recordExpense(tx, cashier, { operationId: randomUUID(), paidOn: '2026-01-01', description: 'Synthetic tea', category: 'Other', method: 'Cash', amount: '2.00' });
  assert.deepEqual((await listPaymentMethods(tx, cashier)).map(m => m.name), ['Cash', 'Bank transfer', 'Easypaisa', 'JazzCash']);
  assert.equal((await listPaymentMethods(tx, outsider)).length, 5);
  for (const name of ['Bank transfer', 'Easypaisa', 'JazzCash']) await setPaymentMethod(tx, owner, { name, active: false });
  await assert.rejects(setPaymentMethod(tx, owner, { name: 'Cash', active: false }), code('LAST_METHOD'));
  await setPaymentMethod(tx, owner, { name: 'Easypaisa', active: true });

  // Closing counts only cash-flag methods; the report lists each method with movement.
  const summary = await closingSummary(tx, owner, '2026-01-01');
  assert.deepEqual([summary.cashReceiptsMinor, summary.cashExpensesMinor, summary.expectedMinor], ['3000', '200', '2800']);
  const report = await financeReport(tx, owner, { from: '2026-01-01', to: '2026-01-01' });
  assert.deepEqual(report.methods.map(m => [m.method, m.receiptsMinor, m.expensesMinor]), [['Cash', '3000', '200'], ['Easypaisa', '2000', '0'], ['JazzCash', '0', '500']]);
  assert.equal(report.totals.receiptsMinor, '5000');

  // Receipts freeze the clinic details at the time of payment.
  await saveClinicSettings(tx, owner, { ...details, expectedVersion: 2, name: 'Renamed Clinic', receiptFooter: 'New footer' });
  const receipt = await getReceipt(tx, owner, first.receipt.id);
  assert.deepEqual([receipt.snapshot.clinicName, receipt.snapshot.clinicAddress, receipt.snapshot.clinicPhone, receipt.snapshot.receiptHeader, receipt.snapshot.receiptFooter, receipt.snapshot.ntn], ['Synthetic Smiles', '12 Test Road, Lahore', '+92 42 0000000', 'Dr. Synthetic, BDS', 'Thank you', '1234567-8']);

  // Closing approval policy: second approver by default; solo policy lets only an owner self-approve, with a note.
  const draft = (who: typeof owner, expectedVersion: number) => saveClosingDraft(tx, who, { businessDate: '2026-01-01', expectedVersion, opening: '0', counted: '28.00', note: '' });
  const approve = (who: typeof owner, version: number, selfApprovalNote?: string) => approveClosing(tx, who, { businessDate: '2026-01-01', expectedVersion: version, expectedCashMinor: '2800', ...(selfApprovalNote ? { selfApprovalNote } : {}) });
  await draft(owner, 0);
  await assert.rejects(approve(owner, 1, 'Counted alone today'), code('SECOND_APPROVER_REQUIRED'));
  await saveClinicSettings(tx, owner, { ...details, expectedVersion: 3, closingApprovalPolicy: 'owner_self_with_note' });
  await assert.rejects(approve(owner, 1), code('SELF_APPROVAL_NOTE_REQUIRED'));
  await assert.rejects(approve(owner, 1, 'short'), status(400));
  await draft(cashier, 1);
  await assert.rejects(approve(cashier, 2, 'Counted alone today'), code('SECOND_APPROVER_REQUIRED'));
  await draft(owner, 2);
  const approved = await approve(owner, 3, 'Counted alone today');
  assert.equal(approved.snapshot.selfApprovalNote, 'Counted alone today');
  await tx.execute(sql`reset role`);
  const actions = (await tx.execute<{ action: string }>(sql`select action from clinic_app.audit_events where clinic_id=${clinic.id}`)).map(r => r.action);
  for (const action of ['clinic.settings.updated', 'clinic.closing_policy.owner_self_with_note', 'clinic.payment_method.disabled:Card', 'clinic.payment_method.enabled:Easypaisa', 'closing.self_approved']) assert.ok(actions.includes(action), action);
  assert.equal((await tx.execute<{ count: number }>(sql`select count(*)::int as count from clinic_app.audit_events where clinic_id=${other.id}`))[0].count, 0);
  throw rollback;
}); } catch (e) { if (e !== rollback) throw e; } console.log('Clinic settings integration passed: owner-only versioned settings, clinic isolation, frozen receipt letterhead, per-clinic payment methods with enable/disable and cash flag in closing and reports, second-approver default and audited owner self-approval. Fixtures rolled back.'); }
catch (e) { console.error('Clinic settings integration failed.', e instanceof assert.AssertionError ? e.message : e instanceof AppError ? e.code : e); process.exitCode = 1; } finally { await client.end(); }

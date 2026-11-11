import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { clinicSettingsInput } from '../src/lib/clinic/contracts.ts';
import { correctionInput, creditNoteInput } from '../src/lib/finance/contracts.ts';
import { createClinicInput, ownerRoles, updateClinicInput } from '../src/lib/operator/contracts.ts';
import { staffInviteInput, staffUpdateInput, permissionGroups } from '../src/lib/staff/contracts.ts';
import { permissionCatalog, roleTemplates } from '../src/server/auth/permissions.ts';

const owner = { email: ' Owner@Clinic.PK ', displayName: 'Dr. Owner' };
test('a new clinic defaults to Pakistan settings and normalises the owner email', () => {
  const clinic = createClinicInput.parse({ operationId: randomUUID(), name: ' Smile Dental ', owner });
  assert.deepEqual([clinic.name, clinic.timezone, clinic.branchName, clinic.paidUntil, clinic.owner.email, clinic.owner.alsoDentist], ['Smile Dental', 'Asia/Karachi', 'Main branch', null, 'owner@clinic.pk', false]);
  for (const bad of [{ timezone: 'Karachi' }, { phone: 'call me' }, { currency: 'USD' }, { paidUntil: '31-12-2026' }, { name: 'x' }]) assert.equal(createClinicInput.safeParse({ operationId: randomUUID(), name: 'Smile Dental', owner, ...bad }).success, false);
  assert.deepEqual(ownerRoles({ alsoDentist: true }), ['dentist', 'owner']); assert.deepEqual(ownerRoles({ alsoDentist: false }), ['owner']);
});
test('a clinic can only be active or suspended', () => {
  assert.equal(updateClinicInput.parse({ status: 'suspended', planNote: ' Unpaid ', paidUntil: '' }).paidUntil, null);
  assert.equal(updateClinicInput.safeParse({ status: 'deleted', planNote: '', paidUntil: null }).success, false);
});
test('role templates use only known permissions and the owner never signs clinical records by default', () => {
  for (const [role, permissions] of Object.entries(roleTemplates)) for (const p of permissions) assert.ok((permissionCatalog as readonly string[]).includes(p), `${role}: ${p}`);
  for (const p of ['visit.finalize', 'visit.draft.write', 'patient.clinical.write']) assert.ok(!roleTemplates.owner.includes(p as never));
  for (const p of ['user.manage', 'clinic.configure', 'charge.credit', 'closing.approve', 'audit.read']) assert.ok(roleTemplates.owner.includes(p as never));
  // Every permission is reachable through owner plus dentist, and shown in exactly one group of the staff screen.
  assert.deepEqual(permissionCatalog.filter(p => !roleTemplates.owner.includes(p) && !roleTemplates.dentist.includes(p)), []);
  for (const p of permissionCatalog) assert.equal(permissionGroups.filter(g => g.prefix.some(x => p.startsWith(x))).length, 1, p);
  assert.ok(!roleTemplates.reception.includes('refund.post') && !roleTemplates.reception.includes('charge.credit') && !roleTemplates.reception.includes('patient.clinical.read'));
});
test('staff, settings and credit note inputs reject unknown or unsafe values', () => {
  const invite = { operationId: randomUUID(), email: 'a@b.pk', displayName: 'Reception', roleNames: ['reception'], branchId: randomUUID() };
  assert.equal(staffInviteInput.safeParse(invite).success, true); assert.equal(staffInviteInput.safeParse({ ...invite, roleNames: [] }).success, false);
  assert.equal(staffUpdateInput.safeParse({ operationId: randomUUID(), roleNames: [], grants: ['root'], branchIds: [randomUUID()], active: true }).success, false);
  const settings = { expectedVersion: 1, name: 'Clinic', city: '', phone: '', address: '', receiptHeader: '', receiptFooter: '', ntn: '', closingApprovalPolicy: 'second_approver' };
  assert.equal(clinicSettingsInput.safeParse(settings).success, true); assert.equal(clinicSettingsInput.safeParse({ ...settings, status: 'active' }).success, false); assert.equal(clinicSettingsInput.safeParse({ ...settings, ntn: 'DROP TABLE' }).success, false);
  assert.equal(creditNoteInput.parse({ operationId: randomUUID(), amount: '1000.50', reason: 'Agreed' }).amount, 100050);
  assert.equal(creditNoteInput.safeParse({ operationId: randomUUID(), amount: '0', reason: 'Agreed' }).success, false);
  assert.equal(correctionInput.safeParse({ operationId: randomUUID(), amount: '10', reason: 'x', description: 'Crown' }).success, false);
});

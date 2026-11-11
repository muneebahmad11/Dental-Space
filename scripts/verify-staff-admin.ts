import './load-env.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { migrationEnvironment, requireLocalDatabase, connectionOptions } from '../src/lib/config/environment.ts';
import { assertStaffAccess, resolveContext } from '../src/server/auth/context.ts';
import { roleTemplates } from '../src/server/auth/permissions.ts';
import { AppError } from '../src/server/http/errors.ts';
import { acceptInvites, createClinic } from '../src/server/operator/service.ts';
import { listPatients } from '../src/server/patients/service.ts';
import { inviteStaff, listStaff, revokeInvite, updateStaff } from '../src/server/staff/service.ts';
const { MIGRATION_DATABASE_URL: url } = migrationEnvironment(process.env); requireLocalDatabase(url); const client = postgres(url, { ...connectionOptions(url), max: 1 }); const rollback = new Error('ROLLBACK_FIXTURES');
const status = (n: number) => (e: unknown) => e instanceof AppError && e.status === n; const code = (c: string) => (e: unknown) => e instanceof AppError && e.code === c;
const denied = (e: unknown) => (e as { cause?: { code?: string } }).cause?.code === '42501';
try { try { await drizzle(client).transaction(async tx => {
  await tx.execute(sql`select pg_advisory_xact_lock(73492029)`);
  const operatorAuth = randomUUID(); await tx.execute(sql`insert into clinic_app.platform_operators(auth_user_id,display_name) values (${operatorAuth},'Synthetic operator')`);
  await tx.execute(sql`set local role clinic_runtime`);
  const send = async () => 'email_sent' as const; const yes = async () => true;
  const clinicFor = async (name: string, email: string) => { const created = await createClinic(tx, operatorAuth, { operationId: randomUUID(), name, owner: { email, displayName: `${name} owner`, alsoDentist: false } }, send); const authUserId = randomUUID(); assert.equal(await acceptInvites(tx, authUserId, email, yes), 1); return { authUserId, clinicId: created.clinicId, branchId: created.branchId }; };
  const owner = await clinicFor('Synthetic Staff Clinic', 'owner@staff.example'); const outsider = await clinicFor('Other Staff Clinic', 'owner@other.example');
  const op = () => randomUUID();

  // Invite: needs user.manage, real roles and a branch of this clinic; binds on first verified sign-in.
  const invite = { operationId: op(), email: 'Reception@Staff.Example', displayName: 'Synthetic Reception', roleNames: ['reception'], branchId: owner.branchId };
  await assert.rejects(inviteStaff(tx, { ...outsider, clinicId: owner.clinicId, branchId: owner.branchId }, invite, send), status(403));
  await assert.rejects(inviteStaff(tx, owner, { ...invite, roleNames: ['superuser'] }, send), code('ROLES_UNAVAILABLE'));
  await assert.rejects(inviteStaff(tx, owner, { ...invite, branchId: outsider.branchId }, send), code('BRANCH_NOT_FOUND'));
  await assert.rejects(inviteStaff(tx, owner, { ...invite, email: 'nope' }, send), status(400));
  const first = await inviteStaff(tx, owner, invite, send); assert.equal(first.delivery, 'email_sent');
  const second = await inviteStaff(tx, owner, { ...invite, operationId: op(), roleNames: ['reception', 'assistant'] }, send);
  let staff = await listStaff(tx, owner);
  assert.deepEqual(staff.invites.map(i => [i.id, i.email, i.roleNames.join('+')]), [[second.inviteId, 'reception@staff.example', 'assistant+reception']]);
  assert.equal((await listStaff(tx, outsider)).invites.length, 0);
  await assert.rejects(revokeInvite(tx, outsider, second.inviteId), status(404));
  const receptionAuth = randomUUID(); assert.equal(await acceptInvites(tx, receptionAuth, 'reception@staff.example', yes), 1);
  const reception = { authUserId: receptionAuth, clinicId: owner.clinicId, branchId: owner.branchId };
  assert.deepEqual([...(await resolveContext(tx, receptionAuth, owner.clinicId, owner.branchId)).permissions].sort(), [...new Set([...roleTemplates.reception, ...roleTemplates.assistant])].sort());
  // A cancelled invite never binds.
  const cancelled = await inviteStaff(tx, owner, { ...invite, operationId: op(), email: 'gone@staff.example' }, send); await revokeInvite(tx, owner, cancelled.inviteId);
  await assert.rejects(revokeInvite(tx, owner, cancelled.inviteId), status(404));
  assert.equal(await acceptInvites(tx, randomUUID(), 'gone@staff.example', yes), 0);

  // Staff without user.manage cannot list or change anyone; the runtime role cannot write access tables itself.
  await assert.rejects(listStaff(tx, reception), status(403));
  staff = await listStaff(tx, owner); const me = staff.members.find(m => m.isSelf)!; const member = staff.members.find(m => !m.isSelf)!;
  assert.equal(staff.members.length, 2); assert.deepEqual(staff.roles.map(r => r.name), ['accountant', 'assistant', 'dentist', 'owner', 'reception']);
  const change = (who: typeof owner, id: string, c: Partial<{ roleNames: string[]; grants: string[]; branchIds: string[]; active: boolean }>) => updateStaff(tx, who, id, { operationId: op(), roleNames: ['reception'], grants: [], branchIds: [owner.branchId], active: true, ...c });
  await assert.rejects(change(reception, member.id, { roleNames: ['owner'] }), status(403));
  for (const query of [sql`insert into clinic_app.membership_grants(clinic_id,membership_id,permission) values (${owner.clinicId},${member.id},'user.manage')`, sql`update clinic_app.memberships set active=false where id=${me.id}`, sql`delete from clinic_app.membership_roles where membership_id=${me.id}`, sql`select clinic_app.require_staff_admin(${owner.authUserId}::uuid,${owner.clinicId}::uuid,${owner.branchId}::uuid)`])
    await assert.rejects(tx.transaction(async n => { await n.execute(query); }), denied);

  // Roles and extra permissions: replaced exactly, validated, and effective on the next request.
  await change(owner, member.id, { roleNames: ['reception'], grants: ['refund.post', 'followup.read'] });
  const permissions = (await resolveContext(tx, receptionAuth, owner.clinicId, owner.branchId)).permissions;
  assert.ok(permissions.has('refund.post') && permissions.has('payment.post') && !permissions.has('patient.clinical.read') && !permissions.has('user.manage'));
  await assert.rejects(change(owner, member.id, { roleNames: ['ghost'] }), code('ROLES_UNAVAILABLE'));
  await assert.rejects(change(owner, member.id, { grants: ['root.everything'] }), status(400));
  await assert.rejects(change(owner, member.id, { branchIds: [] }), status(400));
  await assert.rejects(change(owner, member.id, { branchIds: [outsider.branchId] }), code('BRANCH_NOT_FOUND'));
  // Another clinic's owner can neither see nor change this clinic's members.
  const theirs = (await listStaff(tx, outsider)).members; assert.equal(theirs.length, 1);
  await assert.rejects(change(outsider, member.id, { active: false }), status(404));
  await assert.rejects(change({ ...outsider, clinicId: owner.clinicId, branchId: owner.branchId }, member.id, { active: false }), status(403));

  // Deactivation blocks the next request; the owner cannot deactivate themselves or leave the clinic without an owner.
  await change(owner, member.id, { active: false });
  await assert.rejects(assertStaffAccess(tx, receptionAuth, owner.clinicId, owner.branchId), status(403));
  await assert.rejects(listPatients(tx, reception), status(403));
  assert.equal((await listStaff(tx, owner)).members.find(m => m.id === member.id)?.active, false);
  await change(owner, member.id, { active: true }); await assertStaffAccess(tx, receptionAuth, owner.clinicId, owner.branchId);
  await assert.rejects(change(owner, me.id, { roleNames: ['owner'], active: false }), code('CANNOT_DEACTIVATE_SELF'));
  await assert.rejects(change(owner, me.id, { roleNames: ['dentist'] }), code('LAST_OWNER'));
  assert.ok((await resolveContext(tx, owner.authUserId, owner.clinicId, owner.branchId)).permissions.has('user.manage'));
  // With a second owner, the first can step down, and the new owner can deactivate them.
  await change(owner, member.id, { roleNames: ['owner'] });
  await change(owner, me.id, { roleNames: ['dentist'] });
  await assert.rejects(listStaff(tx, owner), status(403));
  await change(reception, me.id, { roleNames: ['dentist'], active: false });
  await assert.rejects(change(reception, member.id, { roleNames: ['reception'] }), code('LAST_OWNER'));

  await tx.execute(sql`reset role`);
  const actions = (await tx.execute<{ action: string }>(sql`select action from clinic_app.audit_events where clinic_id=${owner.clinicId}`)).map(r => r.action);
  for (const action of ['staff.invited', 'staff.invite.revoked', 'staff.invite.accepted', 'staff.role.added:owner', 'staff.role.removed:assistant', 'staff.permission.added:refund.post', 'staff.permission.removed:refund.post', 'staff.deactivated', 'staff.reactivated']) assert.ok(actions.includes(action), action);
  assert.equal((await tx.execute<{ count: number }>(sql`select count(*)::int as count from clinic_app.audit_events where clinic_id=${outsider.clinicId} and action like 'staff.%' and action<>'staff.invite.accepted'`))[0].count, 0);
  throw rollback;
}); } catch (e) { if (e !== rollback) throw e; } console.log('Staff admin integration passed: owner invites bound by verified email, exact role/permission/branch changes, immediate deactivation, self and last-owner protection, clinic isolation, no direct runtime writes, named audit events. Fixtures rolled back.'); }
catch (e) { console.error('Staff admin integration failed.', e instanceof assert.AssertionError ? e.message : e instanceof AppError ? e.code : e); process.exitCode = 1; } finally { await client.end(); }

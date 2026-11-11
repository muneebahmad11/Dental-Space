import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { InviteDelivery } from '../../lib/operator/contracts.ts';
import { staffInviteInput, staffUpdateInput } from '../../lib/staff/contracts.ts';
import { authorize, resolveContext, type Database } from '../auth/context.ts';
import { roleTemplates } from '../auth/permissions.ts';
import { appUsers, branches, membershipBranches, memberships } from '../db/schema/organization.ts';
import { staffInvites } from '../db/schema/platform.ts';
import { membershipGrants, membershipRoles, permissions, rolePermissions, roles } from '../db/schema/security.ts';
import { AppError } from '../http/errors.ts';
import type { InviteSender } from '../operator/service.ts';
import type { PatientScope } from '../patients/service.ts';

const parse = <T>(schema: z.ZodType<T>, value: unknown, message: string): T => { const r = schema.safeParse(value); if (!r.success) throw new AppError(400, 'INVALID_INPUT', message); return r.data; };
const scopeSchema = z.object({ authUserId: z.uuid(), clinicId: z.uuid(), branchId: z.uuid() });
async function context(db: Database, s: PatientScope) { parse(scopeSchema, s, 'Select a clinic and branch.'); const c = await resolveContext(db, s.authUserId, s.clinicId, s.branchId); authorize(c, 'user.manage'); return c; }
const known: Record<string, [number, string, string]> = {
  STAFF_ADMIN_FORBIDDEN: [403, 'FORBIDDEN', 'Your membership does not allow this action.'],
  MEMBER_NOT_FOUND: [404, 'MEMBER_NOT_FOUND', 'Staff member is not in this clinic.'],
  INVITE_NOT_FOUND: [404, 'INVITE_NOT_FOUND', 'Invite is not pending in this clinic.'],
  BRANCH_NOT_FOUND: [400, 'BRANCH_NOT_FOUND', 'Choose at least one branch of this clinic.'],
  ROLES_UNAVAILABLE: [400, 'ROLES_UNAVAILABLE', 'Choose roles that exist in this clinic.'],
  PERMISSION_UNKNOWN: [400, 'PERMISSION_UNKNOWN', 'One of the permissions is not recognised.'],
  CANNOT_DEACTIVATE_SELF: [409, 'CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account. Ask another owner.'],
  LAST_OWNER: [409, 'LAST_OWNER', 'The clinic must keep at least one active owner.'],
};
// Each change runs in its own (nested) transaction; a refusal from the database becomes a normal error.
async function call<T>(db: Database, run: (tx: Database) => Promise<T>): Promise<T> {
  try { return await db.transaction(tx => run(tx)); }
  catch (error) { for (let e: unknown = error; e instanceof Error; e = e.cause) { const m = known[e.message]; if (m) throw new AppError(...m); } throw error; }
}
// Staff of this clinic only, with the roles and extra permissions that decide their access. No patient data.
export async function listStaff(db: Database, s: PatientScope) {
  const c = await context(db, s);
  if (!(await db.select({ id: roles.id }).from(roles).where(eq(roles.clinicId, s.clinicId)).limit(1)).length)
    await call(db, tx => tx.execute(sql`select clinic_app.staff_ensure_roles(${s.authUserId}::uuid, ${s.clinicId}::uuid, ${s.branchId}::uuid, ${JSON.stringify(roleTemplates)}::jsonb)`));
  const [members, memberRoles, grants, memberBranches, clinicRoles, clinicBranches, catalog, invites] = await Promise.all([
    db.select({ id: memberships.id, name: appUsers.displayName, active: memberships.active, userActive: appUsers.active, joinedAt: memberships.createdAt }).from(memberships).innerJoin(appUsers, eq(appUsers.id, memberships.userId)).where(eq(memberships.clinicId, s.clinicId)).orderBy(asc(appUsers.displayName), asc(memberships.id)),
    db.select({ membershipId: membershipRoles.membershipId, name: roles.name }).from(membershipRoles).innerJoin(roles, and(eq(roles.id, membershipRoles.roleId), eq(roles.clinicId, membershipRoles.clinicId))).where(eq(membershipRoles.clinicId, s.clinicId)),
    db.select({ membershipId: membershipGrants.membershipId, permission: membershipGrants.permission }).from(membershipGrants).where(eq(membershipGrants.clinicId, s.clinicId)),
    db.select({ membershipId: membershipBranches.membershipId, branchId: membershipBranches.branchId }).from(membershipBranches).where(eq(membershipBranches.clinicId, s.clinicId)),
    db.select({ name: roles.name, permission: rolePermissions.permission }).from(roles).leftJoin(rolePermissions, and(eq(rolePermissions.roleId, roles.id), eq(rolePermissions.clinicId, roles.clinicId))).where(eq(roles.clinicId, s.clinicId)).orderBy(asc(roles.name)),
    db.select({ id: branches.id, name: branches.name, active: branches.active }).from(branches).where(eq(branches.clinicId, s.clinicId)).orderBy(asc(branches.name)),
    db.select().from(permissions).orderBy(asc(permissions.key)),
    db.select({ id: staffInvites.id, email: staffInvites.email, displayName: staffInvites.displayName, roleNames: staffInvites.roleNames, branchId: staffInvites.branchId, delivery: staffInvites.delivery, createdAt: staffInvites.createdAt }).from(staffInvites).where(and(eq(staffInvites.clinicId, s.clinicId), eq(staffInvites.status, 'pending'))).orderBy(asc(staffInvites.createdAt)),
  ]);
  const roleMap = new Map<string, string[]>(); for (const r of clinicRoles) { const list = roleMap.get(r.name) ?? []; if (r.permission) list.push(r.permission); roleMap.set(r.name, list); }
  return {
    members: members.map(m => ({ id: m.id, name: m.name, active: m.active && m.userActive, isSelf: m.id === c.membershipId, joinedAt: m.joinedAt, roleNames: memberRoles.filter(r => r.membershipId === m.id).map(r => r.name).sort(), grants: grants.filter(g => g.membershipId === m.id).map(g => g.permission).sort(), branchIds: memberBranches.filter(b => b.membershipId === m.id).map(b => b.branchId) })),
    roles: [...roleMap].map(([name, perms]) => ({ name, permissions: perms.sort() })), branches: clinicBranches, permissions: catalog, invites,
  };
}
async function deliver(db: Database, s: PatientScope, inviteId: string, email: string, send: InviteSender) {
  let delivery: InviteDelivery; try { delivery = await send(email); } catch { delivery = 'failed'; }
  await call(db, tx => tx.execute(sql`select clinic_app.staff_set_invite(${s.authUserId}::uuid, ${s.clinicId}::uuid, ${s.branchId}::uuid, ${inviteId}::uuid, ${delivery}, false, ${crypto.randomUUID()}::uuid)`));
  return delivery;
}
// The invite binds to the person's first sign-in with that verified email. A new invite replaces a pending one.
export async function inviteStaff(db: Database, s: PatientScope, raw: unknown, send: InviteSender) {
  const { operationId, ...invite } = parse(staffInviteInput, raw, 'Check the name, email, role and branch.');
  await context(db, s);
  const [row] = await call(db, tx => tx.execute<{ id: string }>(sql`select clinic_app.staff_invite(${s.authUserId}::uuid, ${s.clinicId}::uuid, ${s.branchId}::uuid, ${JSON.stringify(invite)}::jsonb, ${operationId}::uuid) as id`));
  return { inviteId: row.id, delivery: await deliver(db, s, row.id, invite.email, send) };
}
export async function revokeInvite(db: Database, s: PatientScope, inviteId: string) {
  parse(z.uuid(), inviteId, 'Invite was not found.'); await context(db, s);
  await call(db, tx => tx.execute(sql`select clinic_app.staff_set_invite(${s.authUserId}::uuid, ${s.clinicId}::uuid, ${s.branchId}::uuid, ${inviteId}::uuid, 'not_sent', true, ${crypto.randomUUID()}::uuid)`));
  return { revoked: true };
}
// Sets a member's roles, extra permissions, branches and whether they can sign in to this clinic.
// Deactivation takes effect on that person's next request.
export async function updateStaff(db: Database, s: PatientScope, membershipId: string, raw: unknown) {
  parse(z.uuid(), membershipId, 'Staff member was not found.');
  const { operationId, ...change } = parse(staffUpdateInput, raw, 'Check the roles, permissions and branches.');
  await context(db, s);
  await call(db, tx => tx.execute(sql`select clinic_app.staff_update_member(${s.authUserId}::uuid, ${s.clinicId}::uuid, ${s.branchId}::uuid, ${membershipId}::uuid, ${JSON.stringify(change)}::jsonb, ${operationId}::uuid)`));
  return { updated: true };
}

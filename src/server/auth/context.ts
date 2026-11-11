import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { appUsers, branches, clinics, membershipBranches, memberships } from '../db/schema/organization.ts';
import { membershipGrants, membershipRoles, rolePermissions } from '../db/schema/security.ts';
import { AppError } from '../http/errors.ts';
import type { Permission } from './permissions.ts';

export type Database = PostgresJsDatabase;
const verified: unique symbol = Symbol('verified-staff-context');
export type StaffContext = Readonly<{ actorId: string; membershipId: string; clinicId: string; branchId: string; authUserId: string; permissions: ReadonlySet<string>; [verified]: true }>;
// Runs at the start of every staff API request, before any input is read: the caller must be an active member of
// this active branch in a clinic whose subscription is active. Services then resolve permissions as usual.
export async function assertStaffAccess(db: Database, authUserId: string, clinicId: string, branchId: string) {
  const [found] = await db.select({ clinicStatus: clinics.status })
    .from(appUsers).innerJoin(memberships, eq(memberships.userId, appUsers.id))
    .innerJoin(clinics, eq(clinics.id, memberships.clinicId))
    .innerJoin(membershipBranches, and(eq(membershipBranches.membershipId, memberships.id), eq(membershipBranches.clinicId, memberships.clinicId)))
    .innerJoin(branches, and(eq(branches.id, membershipBranches.branchId), eq(branches.clinicId, memberships.clinicId)))
    .where(and(eq(appUsers.authUserId, authUserId), eq(appUsers.active, true), eq(memberships.active, true), eq(memberships.clinicId, clinicId), eq(branches.id, branchId), eq(branches.active, true))).limit(1);
  if (!found) throw new AppError(403, 'FORBIDDEN', 'No active membership for this clinic and branch.');
  if (found.clinicStatus !== 'active') throw subscriptionInactive();
}
export async function resolveContext(db: Database, authUserId: string, clinicId: string, branchId: string): Promise<StaffContext> {
  const [found] = await db.select({ actorId: appUsers.id, membershipId: memberships.id, clinicStatus: clinics.status })
    .from(appUsers).innerJoin(memberships, eq(memberships.userId, appUsers.id))
    .innerJoin(clinics, eq(clinics.id, memberships.clinicId))
    .innerJoin(membershipBranches, and(eq(membershipBranches.membershipId, memberships.id), eq(membershipBranches.clinicId, memberships.clinicId)))
    .innerJoin(branches, and(eq(branches.id, membershipBranches.branchId), eq(branches.clinicId, memberships.clinicId)))
    .where(and(eq(appUsers.authUserId, authUserId), eq(appUsers.active, true), eq(memberships.active, true), eq(memberships.clinicId, clinicId), eq(branches.id, branchId), eq(branches.active, true))).limit(1);
  if (!found) throw new AppError(403, 'FORBIDDEN', 'No active membership for this clinic and branch.');
  // Every staff request passes through here, so a suspended clinic is blocked on every route. Its data is kept.
  if (found.clinicStatus !== 'active') throw subscriptionInactive();
  const row = { actorId: found.actorId, membershipId: found.membershipId };
  const [direct, inherited] = await Promise.all([
    db.select({ permission: membershipGrants.permission }).from(membershipGrants).where(and(eq(membershipGrants.membershipId, row.membershipId), eq(membershipGrants.clinicId, clinicId))),
    db.select({ permission: rolePermissions.permission }).from(membershipRoles).innerJoin(rolePermissions, and(eq(rolePermissions.roleId, membershipRoles.roleId), eq(rolePermissions.clinicId, membershipRoles.clinicId))).where(and(eq(membershipRoles.membershipId, row.membershipId), eq(membershipRoles.clinicId, clinicId))),
  ]);
  return { [verified]: true, ...row, authUserId, clinicId, branchId, permissions: new Set([...direct, ...inherited].map(p => p.permission)) };
}
export function subscriptionInactive() {
  const contact = process.env.SUPPORT_CONTACT?.trim();
  return new AppError(403, 'SUBSCRIPTION_INACTIVE', `Subscription inactive. Contact ${contact || 'your software provider'} to restore access. Your clinic's records are kept.`);
}
export function authorize(context: StaffContext, permission: Permission) {
  if (!context.permissions.has(permission)) throw new AppError(403, 'FORBIDDEN', 'Your membership does not allow this action.');
}

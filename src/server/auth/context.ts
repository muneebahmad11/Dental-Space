import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { appUsers, branches, membershipBranches, memberships } from '../db/schema/organization.ts';
import { membershipGrants, membershipRoles, rolePermissions } from '../db/schema/security.ts';
import { AppError } from '../http/errors.ts';
import type { Permission } from './permissions.ts';

export type Database = PostgresJsDatabase;
const verified: unique symbol = Symbol('verified-staff-context');
export type StaffContext = Readonly<{ actorId: string; membershipId: string; clinicId: string; branchId: string; authUserId: string; permissions: ReadonlySet<string>; [verified]: true }>;
export async function resolveContext(db: Database, authUserId: string, clinicId: string, branchId: string): Promise<StaffContext> {
  const [row] = await db.select({ actorId: appUsers.id, membershipId: memberships.id })
    .from(appUsers).innerJoin(memberships, eq(memberships.userId, appUsers.id))
    .innerJoin(membershipBranches, and(eq(membershipBranches.membershipId, memberships.id), eq(membershipBranches.clinicId, memberships.clinicId)))
    .innerJoin(branches, and(eq(branches.id, membershipBranches.branchId), eq(branches.clinicId, memberships.clinicId)))
    .where(and(eq(appUsers.authUserId, authUserId), eq(appUsers.active, true), eq(memberships.active, true), eq(memberships.clinicId, clinicId), eq(branches.id, branchId), eq(branches.active, true))).limit(1);
  if (!row) throw new AppError(403, 'FORBIDDEN', 'No active membership for this clinic and branch.');
  const [direct, inherited] = await Promise.all([
    db.select({ permission: membershipGrants.permission }).from(membershipGrants).where(and(eq(membershipGrants.membershipId, row.membershipId), eq(membershipGrants.clinicId, clinicId))),
    db.select({ permission: rolePermissions.permission }).from(membershipRoles).innerJoin(rolePermissions, and(eq(rolePermissions.roleId, membershipRoles.roleId), eq(rolePermissions.clinicId, membershipRoles.clinicId))).where(and(eq(membershipRoles.membershipId, row.membershipId), eq(membershipRoles.clinicId, clinicId))),
  ]);
  return { [verified]: true, ...row, authUserId, clinicId, branchId, permissions: new Set([...direct, ...inherited].map(p => p.permission)) };
}
export function authorize(context: StaffContext, permission: Permission) {
  if (!context.permissions.has(permission)) throw new AppError(403, 'FORBIDDEN', 'Your membership does not allow this action.');
}

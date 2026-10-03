import { and, eq } from 'drizzle-orm';
import { resolveContext } from '@/server/auth/context';
import { requireIdentity } from '@/server/auth/session';
import { getDatabase } from '@/server/db/client';
import { appUsers, branches, clinics, memberships, membershipBranches } from '@/server/db/schema/organization';
import { failure, response } from '@/server/http/patient-request';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const authUserId = await requireIdentity();
    const scopes = await getDatabase().select({ clinicId: clinics.id, clinicName: clinics.name, currency: clinics.currency, timezone: clinics.timezone, branchId: branches.id, branchName: branches.name })
      .from(appUsers).innerJoin(memberships, eq(memberships.userId, appUsers.id))
      .innerJoin(clinics, eq(clinics.id, memberships.clinicId))
      .innerJoin(membershipBranches, and(eq(membershipBranches.membershipId, memberships.id), eq(membershipBranches.clinicId, clinics.id)))
      .innerJoin(branches, and(eq(branches.id, membershipBranches.branchId), eq(branches.clinicId, clinics.id)))
      .where(and(eq(appUsers.authUserId, authUserId), eq(appUsers.active, true), eq(memberships.active, true), eq(branches.active, true)))
      .orderBy(clinics.name, branches.name);
    const authorizedScopes = await Promise.all(scopes.map(async scope => {
      const context = await resolveContext(getDatabase(), authUserId, scope.clinicId, scope.branchId);
      return { ...scope, permissions: [...context.permissions] };
    }));
    return response({ scopes: authorizedScopes });
  } catch (error) { return failure(error); }
}

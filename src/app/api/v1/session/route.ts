import { and, eq } from 'drizzle-orm';
import { emailVerified } from '@/server/auth/admin';
import { resolveContext, subscriptionInactive } from '@/server/auth/context';
import { requireIdentityClaims } from '@/server/auth/session';
import { getDatabase } from '@/server/db/client';
import { appUsers, branches, clinics, memberships, membershipBranches } from '@/server/db/schema/organization';
import { platformOperators } from '@/server/db/schema/platform';
import { failure, response } from '@/server/http/patient-request';
import { acceptInvites } from '@/server/operator/service';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const { subject: authUserId, email } = await requireIdentityClaims();
    const db = getDatabase();
    // A first sign-in binds any pending invite for this verified email before access is listed.
    await acceptInvites(db, authUserId, email, emailVerified);
    const [all, [operator]] = await Promise.all([
      db.select({ clinicId: clinics.id, clinicName: clinics.name, currency: clinics.currency, timezone: clinics.timezone, status: clinics.status, branchId: branches.id, branchName: branches.name })
        .from(appUsers).innerJoin(memberships, eq(memberships.userId, appUsers.id))
        .innerJoin(clinics, eq(clinics.id, memberships.clinicId))
        .innerJoin(membershipBranches, and(eq(membershipBranches.membershipId, memberships.id), eq(membershipBranches.clinicId, clinics.id)))
        .innerJoin(branches, and(eq(branches.id, membershipBranches.branchId), eq(branches.clinicId, clinics.id)))
        .where(and(eq(appUsers.authUserId, authUserId), eq(appUsers.active, true), eq(memberships.active, true), eq(branches.active, true)))
        .orderBy(clinics.name, branches.name),
      db.select({ id: platformOperators.id }).from(platformOperators).where(and(eq(platformOperators.authUserId, authUserId), eq(platformOperators.active, true))),
    ]);
    const scopes = all.filter(scope => scope.status === 'active');
    if (all.length && !scopes.length) throw subscriptionInactive();
    const authorizedScopes = await Promise.all(scopes.map(async ({ clinicId, clinicName, currency, timezone, branchId, branchName }) => {
      const scope = { clinicId, clinicName, currency, timezone, branchId, branchName };
      const context = await resolveContext(db, authUserId, scope.clinicId, scope.branchId);
      return { ...scope, permissions: [...context.permissions] };
    }));
    return response({ scopes: authorizedScopes, operator: !!operator });
  } catch (error) { return failure(error); }
}

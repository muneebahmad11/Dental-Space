import { and, desc, eq } from 'drizzle-orm';
import { authorize, resolveContext, type Database } from '../auth/context.ts';
import { auditEvents } from '../db/schema/security.ts';
import type { PatientScope } from '../patients/service.ts';
export async function listAuditEvents(db: Database, scope: PatientScope) {
  const ctx = await resolveContext(db, scope.authUserId, scope.clinicId, scope.branchId);
  authorize(ctx, 'audit.read');
  return db.select({ id: auditEvents.id, action: auditEvents.action, entityType: auditEvents.entityType, entityId: auditEvents.entityId, actorMembershipId: auditEvents.actorMembershipId, occurredAt: auditEvents.occurredAt, requestId: auditEvents.requestId })
    .from(auditEvents).where(and(eq(auditEvents.clinicId, ctx.clinicId), eq(auditEvents.branchId, ctx.branchId))).orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id)).limit(100);
}

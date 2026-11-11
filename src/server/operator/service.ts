import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { createClinicInput, ownerInput, ownerRoles, updateClinicInput, type InviteDelivery } from '../../lib/operator/contracts.ts';
import type { Database } from '../auth/context.ts';
import { roleTemplates } from '../auth/permissions.ts';
import { clinics } from '../db/schema/organization.ts';
import { operatorAuditEvents, platformOperators, staffInvites } from '../db/schema/platform.ts';
import { AppError } from '../http/errors.ts';

// Sends the sign-in invitation. Injected so integration checks never contact the Auth provider.
export type InviteSender = (email: string) => Promise<InviteDelivery>;
const parse = <T>(schema: z.ZodType<T>, value: unknown, message: string): T => { const r = schema.safeParse(value); if (!r.success) throw new AppError(400, 'INVALID_INPUT', message); return r.data; };
const known: Record<string, AppError> = {
  OPERATOR_FORBIDDEN: new AppError(403, 'FORBIDDEN', 'Operator access is required.'),
  CLINIC_NOT_FOUND: new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic was not found.'),
  INVITE_NOT_FOUND: new AppError(404, 'INVITE_NOT_FOUND', 'Invite was not found.'),
  OPERATION_CONFLICT: new AppError(409, 'OPERATION_CONFLICT', 'This operation key has different clinic details.'),
  ROLES_UNAVAILABLE: new AppError(409, 'ROLES_UNAVAILABLE', 'This clinic has no owner role to assign.'),
};
// Database functions raise a bare code; anything else stays an internal error.
// Each call runs in its own (nested) transaction so a refusal leaves the caller's transaction usable.
async function call<T>(db: Database, run: (tx: Database) => Promise<T>): Promise<T> {
  try { return await db.transaction(tx => run(tx)); }
  catch (error) {
    for (let e: unknown = error; e instanceof Error; e = e.cause) { const mapped = known[e.message]; if (mapped) throw new AppError(mapped.status, mapped.code, mapped.message); }
    throw error;
  }
}
export async function requireOperator(db: Database, authUserId: string) {
  parse(z.uuid(), authUserId, 'Sign in again.');
  const [row] = await db.select({ id: platformOperators.id, displayName: platformOperators.displayName }).from(platformOperators).where(and(eq(platformOperators.authUserId, authUserId), eq(platformOperators.active, true)));
  if (!row) throw new AppError(403, 'FORBIDDEN', 'Operator access is required.');
  return row;
}
// Clinic-level facts only: no patient, clinical or finance data is read here.
export async function listClinics(db: Database, authUserId: string) {
  const operator = await requireOperator(db, authUserId);
  const rows = await db.execute<{ id: string; name: string; city: string; phone: string; timezone: string; status: string; planNote: string; paidUntil: string | null; createdAt: string; branchName: string | null; staffCount: number; ownerEmail: string | null; ownerName: string | null; inviteStatus: string | null; inviteDelivery: InviteDelivery | null }>(sql`
    select c.id, c.name, c.city, c.phone, c.timezone, c.status, c.plan_note as "planNote", c.paid_until::text as "paidUntil", c.created_at as "createdAt",
      (select b.name from clinic_app.branches b where b.clinic_id = c.id order by b.created_at, b.id limit 1) as "branchName",
      (select count(*)::int from clinic_app.memberships m where m.clinic_id = c.id and m.active) as "staffCount",
      i.email as "ownerEmail", i.display_name as "ownerName", i.status as "inviteStatus", i.delivery as "inviteDelivery"
    from clinic_app.clinics c
    left join lateral (select email, display_name, status, delivery from clinic_app.staff_invites s where s.clinic_id = c.id and s.invited_by_operator_id is not null and s.status <> 'revoked' order by s.created_at desc, s.id limit 1) i on true
    order by c.created_at desc, c.id limit 500`);
  return { operator: { displayName: operator.displayName }, clinics: [...rows] };
}
async function deliver(db: Database, authUserId: string, inviteId: string, send: InviteSender): Promise<InviteDelivery> {
  const [invite] = await db.select({ email: staffInvites.email, status: staffInvites.status }).from(staffInvites).where(and(eq(staffInvites.id, inviteId), isNotNull(staffInvites.invitedByOperatorId)));
  if (!invite) throw new AppError(404, 'INVITE_NOT_FOUND', 'Invite was not found.');
  if (invite.status !== 'pending') return 'existing_account';
  let delivery: InviteDelivery;
  try { delivery = await send(invite.email); } catch { delivery = 'failed'; }
  await call(db, tx => tx.execute(sql`select clinic_app.operator_record_invite_delivery(${authUserId}::uuid, ${inviteId}::uuid, ${delivery})`));
  return delivery;
}
export async function createClinic(db: Database, authUserId: string, raw: unknown, send: InviteSender) {
  await requireOperator(db, authUserId);
  const input = parse(createClinicInput, raw, 'Check the clinic name, phone, timezone and owner email.');
  const { operationId, owner, ...clinic } = input;
  const ownerPayload = { email: owner.email, displayName: owner.displayName, roleNames: ownerRoles(owner) };
  const digest = createHash('sha256').update(JSON.stringify({ clinic, ownerPayload })).digest('hex');
  const [row] = await call(db, tx => tx.execute<{ result: { clinicId: string; branchId: string; inviteId: string; replayed: boolean } }>(sql`
    select clinic_app.operator_create_clinic(${authUserId}::uuid, ${operationId}::uuid, ${digest}, ${JSON.stringify(clinic)}::jsonb, ${JSON.stringify(ownerPayload)}::jsonb, ${JSON.stringify(roleTemplates)}::jsonb) as result`));
  // The clinic is committed before the email goes out: a failed email is recorded and can be resent, never lost.
  const delivery = row.result.replayed ? null : await deliver(db, authUserId, row.result.inviteId, send);
  return { ...row.result, delivery };
}
export async function updateClinic(db: Database, authUserId: string, clinicId: string, raw: unknown) {
  await requireOperator(db, authUserId);
  parse(z.uuid(), clinicId, 'Clinic was not found.');
  const input = parse(updateClinicInput, raw, 'Check the status, plan note and paid-until date.');
  await call(db, tx => tx.execute(sql`select clinic_app.operator_update_clinic(${authUserId}::uuid, ${clinicId}::uuid, ${input.status}, ${input.planNote}, ${input.paidUntil}::date)`));
  const [clinic] = await db.select({ id: clinics.id, status: clinics.status, planNote: clinics.planNote, paidUntil: clinics.paidUntil }).from(clinics).where(eq(clinics.id, clinicId));
  return clinic;
}
// Replaces any pending owner invite; an already accepted owner keeps access.
export async function inviteOwner(db: Database, authUserId: string, clinicId: string, raw: unknown, send: InviteSender) {
  await requireOperator(db, authUserId);
  parse(z.uuid(), clinicId, 'Clinic was not found.');
  const owner = parse(ownerInput, raw, 'Check the owner name and email.');
  const payload = { email: owner.email, displayName: owner.displayName, roleNames: ownerRoles(owner) };
  const [row] = await call(db, tx => tx.execute<{ id: string }>(sql`select clinic_app.operator_invite_owner(${authUserId}::uuid, ${clinicId}::uuid, ${JSON.stringify(payload)}::jsonb) as id`));
  return { inviteId: row.id, delivery: await deliver(db, authUserId, row.id, send) };
}
export async function operatorAudit(db: Database, authUserId: string, clinicId: string) {
  await requireOperator(db, authUserId);
  parse(z.uuid(), clinicId, 'Clinic was not found.');
  return db.select({ id: operatorAuditEvents.id, action: operatorAuditEvents.action, occurredAt: operatorAuditEvents.occurredAt, operatorName: platformOperators.displayName })
    .from(operatorAuditEvents).innerJoin(platformOperators, eq(platformOperators.id, operatorAuditEvents.operatorId))
    .where(eq(operatorAuditEvents.clinicId, clinicId)).orderBy(desc(operatorAuditEvents.occurredAt)).limit(50);
}
// Email ownership must be proven by the Auth provider before an invite is bound to a sign-in.
export type EmailVerifier = (authUserId: string, email: string) => Promise<boolean>;
export async function acceptInvites(db: Database, authUserId: string, email: string | null, verified: EmailVerifier) {
  const address = email?.trim().toLowerCase();
  if (!address) return 0;
  const [pending] = await db.select({ id: staffInvites.id }).from(staffInvites).where(and(eq(staffInvites.email, address), eq(staffInvites.status, 'pending'))).limit(1);
  if (!pending || !await verified(authUserId, address)) return 0;
  const [row] = await db.execute<{ accepted: number }>(sql`select clinic_app.accept_staff_invites(${authUserId}::uuid, ${address}, ${randomUUID()}::uuid) as accepted`);
  return row.accepted;
}

import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { clinicSettingsInput, logoInput, logoKind, logoMaxBytes, paymentMethodInput, type ClinicSettings, type PaymentMethod } from '../../lib/clinic/contracts.ts';
import { authorize, resolveContext, type Database } from '../auth/context.ts';
import { clinicLogos, clinicPaymentMethods, clinics } from '../db/schema/organization.ts';
import { auditEvents } from '../db/schema/security.ts';
import { AppError } from '../http/errors.ts';
import { clinicTemplates } from '../../lib/messaging/templates.ts';
import type { PatientScope } from '../patients/service.ts';

const parse = <T>(schema: z.ZodType<T>, value: unknown, message = 'Check the clinic details.'): T => { const r = schema.safeParse(value); if (!r.success) throw new AppError(400, 'INVALID_INPUT', message); return r.data; };
const scopeSchema = z.object({ authUserId: z.uuid(), clinicId: z.uuid(), branchId: z.uuid() });
// Clinic details and payment methods hold no patient data: any active member reads them, clinic.configure changes them.
async function context(db: Database, s: PatientScope, write = false) { parse(scopeSchema, s); const c = await resolveContext(db, s.authUserId, s.clinicId, s.branchId); if (write) authorize(c, 'clinic.configure'); return c; }
const settingsFields = { name: clinics.name, city: clinics.city, phone: clinics.phone, address: clinics.address, receiptHeader: clinics.receiptHeader, receiptFooter: clinics.receiptFooter, ntn: clinics.ntn, closingApprovalPolicy: clinics.closingApprovalPolicy, version: clinics.settingsVersion };
async function audit(db: Database, s: PatientScope, actor: string, action: string) { await db.insert(auditEvents).values({ clinicId: s.clinicId, branchId: s.branchId, actorMembershipId: actor, entityId: s.clinicId, entityType: 'clinic', action, requestId: randomUUID() }); }
async function methods(db: Database, clinicId: string): Promise<PaymentMethod[]> {
  return db.select({ name: clinicPaymentMethods.name, isCash: clinicPaymentMethods.isCash, active: clinicPaymentMethods.active }).from(clinicPaymentMethods).where(eq(clinicPaymentMethods.clinicId, clinicId)).orderBy(asc(clinicPaymentMethods.sortOrder), asc(clinicPaymentMethods.name));
}
export async function readClinicSettings(db: Database, s: PatientScope) {
  const c = await context(db, s);
  const [settings] = await db.select(settingsFields).from(clinics).where(eq(clinics.id, s.clinicId));
  const [extra] = await db.select({ templates: clinics.messageTemplates, logoId: clinics.logoId }).from(clinics).where(eq(clinics.id, s.clinicId));
  return { settings: settings as ClinicSettings, paymentMethods: await methods(db, s.clinicId), canConfigure: c.permissions.has('clinic.configure'), messageTemplates: clinicTemplates(extra.templates), logo: await logoDataUrl(db, s.clinicId, extra.logoId) };
}
export async function saveClinicSettings(db: Database, s: PatientScope, raw: unknown) {
  const { expectedVersion, ...input } = parse(clinicSettingsInput, raw, 'Check the clinic name, phone, NTN and text lengths.');
  return db.transaction(async tx => {
    const c = await context(tx, s, true);
    const [before] = await tx.select(settingsFields).from(clinics).where(eq(clinics.id, s.clinicId)).for('update');
    if (before.version !== expectedVersion) throw new AppError(409, 'SETTINGS_CONFLICT', 'Clinic settings changed. Reload before saving.');
    const [settings] = await tx.update(clinics).set({ ...input, settingsVersion: expectedVersion + 1 }).where(and(eq(clinics.id, s.clinicId), eq(clinics.settingsVersion, expectedVersion))).returning(settingsFields);
    await audit(tx, s, c.membershipId, 'clinic.settings.updated');
    // The closing rule is a financial control, so a change to it is recorded on its own.
    if (before.closingApprovalPolicy !== input.closingApprovalPolicy) await audit(tx, s, c.membershipId, `clinic.closing_policy.${input.closingApprovalPolicy}`);
    return settings as ClinicSettings;
  });
}
// Active methods for payment and expense forms.
export async function listPaymentMethods(db: Database, s: PatientScope) { await context(db, s); return (await methods(db, s.clinicId)).filter(m => m.active); }
export async function setPaymentMethod(db: Database, s: PatientScope, raw: unknown) {
  const input = parse(paymentMethodInput, raw, 'Choose a payment method.');
  return db.transaction(async tx => {
    const c = await context(tx, s, true);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${s.clinicId + ':payment-methods'}, 0))`);
    const all = await methods(tx, s.clinicId); const current = all.find(m => m.name === input.name);
    if (!current) throw new AppError(404, 'METHOD_NOT_FOUND', 'Payment method was not found.');
    if (current.active !== input.active) {
      if (!input.active && all.filter(m => m.active).length === 1) throw new AppError(409, 'LAST_METHOD', 'Keep at least one payment method enabled.');
      await tx.update(clinicPaymentMethods).set({ active: input.active }).where(and(eq(clinicPaymentMethods.clinicId, s.clinicId), eq(clinicPaymentMethods.name, input.name)));
      await audit(tx, s, c.membershipId, `clinic.payment_method.${input.active ? 'enabled' : 'disabled'}:${input.name}`);
    }
    return methods(tx, s.clinicId);
  });
}
// New payments and expenses may only use a method the clinic has enabled. Past records keep their method.
export async function requireActiveMethod(db: Database, clinicId: string, name: string) {
  const [row] = await db.select({ active: clinicPaymentMethods.active }).from(clinicPaymentMethods).where(and(eq(clinicPaymentMethods.clinicId, clinicId), eq(clinicPaymentMethods.name, name)));
  if (!row?.active) throw new AppError(400, 'METHOD_UNAVAILABLE', 'Choose a payment method this clinic has enabled.');
}
export const cashMethod = (clinicId: string, column: unknown) => sql`${column} in (select name from clinic_app.clinic_payment_methods where clinic_id = ${clinicId} and is_cash)`;

// The clinic's current logo as a data URL, or null. Used by settings, receipts and printed estimates.
export async function logoDataUrl(db: Database, clinicId: string, logoId: string | null | undefined) {
  if (!logoId) return null;
  const [row] = await db.select({ id: clinicLogos.id, mimeType: clinicLogos.mimeType, data: clinicLogos.data }).from(clinicLogos).where(and(eq(clinicLogos.clinicId, clinicId), eq(clinicLogos.id, logoId)));
  return row ? { id: row.id, dataUrl: `data:${row.mimeType};base64,${row.data}` } : null;
}
// Uploading adds a new logo row (old receipts keep theirs); removing only clears the clinic's current logo.
export async function saveClinicLogo(db: Database, s: PatientScope, raw: unknown) {
  const input = parse(logoInput, raw, 'Choose a PNG, JPG or WebP image.');
  let upload: { mimeType: string; data: string } | null = null;
  if ('dataUrl' in input) {
    const [head, data] = input.dataUrl.split(',');
    const bytes = Buffer.from(data, 'base64');
    const kind = logoKind(bytes);
    if (!kind || !head.startsWith(`data:${kind};`)) throw new AppError(400, 'LOGO_INVALID', 'That file is not a PNG, JPG or WebP image.');
    if (bytes.length > logoMaxBytes) throw new AppError(400, 'LOGO_TOO_LARGE', 'The logo is too large. Use an image under 200 KB.');
    upload = { mimeType: kind, data };
  }
  return db.transaction(async tx => {
    const c = await context(tx, s, true);
    let logoId: string | null = null;
    if (upload) [{ id: logoId }] = await tx.insert(clinicLogos).values({ clinicId: s.clinicId, actorMembershipId: c.membershipId, ...upload }).returning({ id: clinicLogos.id });
    const [row] = await tx.update(clinics).set({ logoId, settingsVersion: input.expectedVersion + 1 }).where(and(eq(clinics.id, s.clinicId), eq(clinics.settingsVersion, input.expectedVersion))).returning({ version: clinics.settingsVersion });
    if (!row) throw new AppError(409, 'SETTINGS_CONFLICT', 'Clinic settings changed. Reload before saving.');
    await audit(tx, s, c.membershipId, upload ? 'clinic.logo.uploaded' : 'clinic.logo.removed');
    return { version: row.version, logo: await logoDataUrl(tx, s.clinicId, logoId) };
  });
}

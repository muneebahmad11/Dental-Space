import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { contactAllowed, purposeLabels } from '../../lib/contact-preferences/contracts.ts';
import { clinicTemplates, fillTemplate, messageTemplates, rupees, saveTemplatesInput, templateProblem, templateText, whatsappLinkInput, whatsappNumber, whatsappUrl, type TemplateKey } from '../../lib/messaging/templates.ts';
import type { PlanSnapshot } from '../../lib/plans/contracts.ts';
import { authorize, resolveContext, type Database } from '../auth/context.ts';
import { appointments } from '../db/schema/appointments.ts';
import { receipts } from '../db/schema/finance.ts';
import { clinics } from '../db/schema/organization.ts';
import { patients } from '../db/schema/patients.ts';
import { planVersions, treatmentPlans } from '../db/schema/plans.ts';
import { scheduleDentists } from '../db/schema/scheduling.ts';
import { auditEvents } from '../db/schema/security.ts';
import { totals } from '../finance/service.ts';
import { AppError } from '../http/errors.ts';
import { currentContactPreferences } from '../patient-profile/contact.ts';
import type { PatientScope } from '../patients/service.ts';

const parse = <T>(schema: z.ZodType<T>, raw: unknown, message: string): T => { const r = schema.safeParse(raw); if (!r.success) throw new AppError(400, 'INVALID_INPUT', message); return r.data; };
const scopeSchema = z.object({ authUserId: z.uuid(), clinicId: z.uuid(), branchId: z.uuid() });
const day = (tz: string, d: Date) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(d);
const clock = (tz: string, d: Date) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(d);
const isoDay = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

// Builds the WhatsApp text for one patient from their records and returns a wa.me link. Staff send it themselves
// from their own WhatsApp. Contact preferences are respected and every opened message is audited.
export async function whatsappLink(db: Database, s: PatientScope, raw: unknown) {
  parse(scopeSchema, s, 'Check the clinic scope.');
  const input = parse(whatsappLinkInput, raw, 'Choose a patient and message.');
  const meta = messageTemplates[input.template];
  return db.transaction(async tx => {
    const c = await resolveContext(tx, s.authUserId, s.clinicId, s.branchId);
    authorize(c, 'communication.send'); authorize(c, 'patient.demographics.read');
    if (meta.need === 'appointment') authorize(c, 'appointment.read');
    if (meta.need === 'balance' || meta.need === 'receipt') authorize(c, 'billing.read');
    if (meta.need === 'plan') { authorize(c, 'plan.read'); authorize(c, 'patient.clinical.read'); }
    const [p] = await tx.select({ id: patients.id, name: patients.name, phone: patients.phone }).from(patients).where(and(eq(patients.clinicId, s.clinicId), eq(patients.id, input.patientId)));
    if (!p) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient is not available in this clinic.');
    if (!contactAllowed(await currentContactPreferences(tx, s.clinicId, p.id), 'whatsapp', meta.purpose))
      throw new AppError(409, 'CONTACT_NOT_ALLOWED', `${p.name}'s contact preferences do not allow WhatsApp messages for ${purposeLabels[meta.purpose].toLowerCase()}.`);
    const number = whatsappNumber(p.phone);
    if (!number) throw new AppError(422, 'PHONE_NOT_WHATSAPP', `${p.name}'s phone number can't be used for WhatsApp. Save a mobile number such as 0300 1234567 on their profile.`);
    const [clinic] = await tx.select({ name: clinics.name, phone: clinics.phone, address: clinics.address, city: clinics.city, timezone: clinics.timezone, templates: clinics.messageTemplates }).from(clinics).where(eq(clinics.id, s.clinicId));
    const values: Record<string, string> = { patient: p.name, clinic: clinic.name, clinicPhone: clinic.phone || 'the clinic', address: [clinic.address, clinic.city].filter(Boolean).join(', ') || clinic.name };
    if (meta.need === 'appointment') {
      if (!input.appointmentId) throw new AppError(400, 'APPOINTMENT_REQUIRED', 'Open this message from an appointment.');
      const [a] = await tx.select({ startsAt: appointments.startsAt, dentist: scheduleDentists.name }).from(appointments).leftJoin(scheduleDentists, eq(scheduleDentists.id, appointments.dentistId))
        .where(and(eq(appointments.clinicId, s.clinicId), eq(appointments.branchId, s.branchId), eq(appointments.patientId, p.id), eq(appointments.id, input.appointmentId)));
      if (!a) throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment is not available in this branch.');
      Object.assign(values, { date: day(clinic.timezone, a.startsAt), time: clock(clinic.timezone, a.startsAt), dentist: a.dentist ?? '' });
    }
    if (meta.need === 'balance') {
      const { balanceMinor } = await totals(tx, s, p.id);
      if (BigInt(balanceMinor) <= BigInt(0)) throw new AppError(409, 'NO_BALANCE_DUE', `${p.name} has nothing to pay at this branch.`);
      values.balance = rupees(balanceMinor);
    }
    if (meta.need === 'receipt') {
      if (!input.receiptId) throw new AppError(400, 'RECEIPT_REQUIRED', 'Open this message from a receipt.');
      const [r] = await tx.select({ number: receipts.number, snapshot: receipts.snapshot }).from(receipts).where(and(eq(receipts.clinicId, s.clinicId), eq(receipts.branchId, s.branchId), eq(receipts.patientId, p.id), eq(receipts.id, input.receiptId)));
      if (!r) throw new AppError(404, 'RECEIPT_NOT_FOUND', 'Receipt is not available in this branch.');
      Object.assign(values, { amount: rupees(r.snapshot.amountMinor), method: r.snapshot.method, paidOn: isoDay(r.snapshot.paidOn), receipt: r.number, balance: rupees(r.snapshot.balanceMinor),
        items: r.snapshot.allocations.map(a => `• ${a.description}: ${rupees(a.amountMinor)}`).join('\n') || '• Payment on account' });
    }
    if (meta.need === 'plan') {
      if (!input.planId) throw new AppError(400, 'PLAN_REQUIRED', 'Open this message from an estimate.');
      const [v] = await tx.select({ snapshot: planVersions.snapshot }).from(treatmentPlans).innerJoin(planVersions, and(eq(planVersions.planId, treatmentPlans.id), eq(planVersions.version, treatmentPlans.version)))
        .where(and(eq(treatmentPlans.clinicId, s.clinicId), eq(treatmentPlans.branchId, s.branchId), eq(treatmentPlans.patientId, p.id), eq(treatmentPlans.id, input.planId)));
      if (!v) throw new AppError(404, 'PLAN_NOT_FOUND', 'Estimate is not available in this branch.');
      const snap = v.snapshot as PlanSnapshot;
      Object.assign(values, { total: rupees(snap.totalMinor), validUntil: snap.validUntil ? isoDay(snap.validUntil) : '' });
    }
    let text = fillTemplate(templateText(input.template, clinic.templates), values);
    if (input.template === 'estimate' && !values.validUntil) text = text.replace(/\s*It is valid until\s*\./, '');
    await tx.insert(auditEvents).values({ clinicId: s.clinicId, branchId: s.branchId, actorMembershipId: c.membershipId, entityId: p.id, entityType: 'patient', action: `message.whatsapp_opened:${input.template}`, requestId: randomUUID() });
    return { url: whatsappUrl(number, text), text, number };
  });
}

export async function saveMessageTemplates(db: Database, s: PatientScope, raw: unknown) {
  parse(scopeSchema, s, 'Check the clinic scope.');
  const input = parse(saveTemplatesInput, raw, 'Check the message wording.');
  const stored: Record<string, string> = {};
  for (const [key, text] of Object.entries(input.templates) as [TemplateKey, string][]) {
    const t = text.trim(); if (!t || t === messageTemplates[key].text) continue;
    const problem = templateProblem(key, t); if (problem) throw new AppError(400, 'TEMPLATE_INVALID', problem);
    stored[key] = t;
  }
  return db.transaction(async tx => {
    const c = await resolveContext(tx, s.authUserId, s.clinicId, s.branchId); authorize(c, 'clinic.configure');
    const [row] = await tx.update(clinics).set({ messageTemplates: stored, settingsVersion: input.expectedVersion + 1 })
      .where(and(eq(clinics.id, s.clinicId), eq(clinics.settingsVersion, input.expectedVersion))).returning({ version: clinics.settingsVersion });
    if (!row) throw new AppError(409, 'SETTINGS_CONFLICT', 'Clinic settings changed. Reload before saving.');
    await tx.insert(auditEvents).values({ clinicId: s.clinicId, branchId: s.branchId, actorMembershipId: c.membershipId, entityId: s.clinicId, entityType: 'clinic', action: 'clinic.message_templates.updated', requestId: randomUUID() });
    return { version: row.version, templates: clinicTemplates(stored) };
  });
}

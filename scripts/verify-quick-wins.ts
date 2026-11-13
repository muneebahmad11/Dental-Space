import './load-env.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, sql } from 'drizzle-orm';
import { migrationEnvironment, requireLocalDatabase, connectionOptions } from '../src/lib/config/environment.ts';
import { businessDate } from '../src/lib/finance/contracts.ts';
import { addDays, zonedInstant } from '../src/lib/scheduling/contracts.ts';
import { clinics, branches, appUsers, memberships, membershipBranches } from '../src/server/db/schema/organization.ts';
import { auditEvents, membershipGrants } from '../src/server/db/schema/security.ts';
import { bookAppointment } from '../src/server/appointments/service.ts';
import { readClinicSettings, saveClinicLogo } from '../src/server/clinic/settings.ts';
import { unpaidBalances } from '../src/server/finance/dues.ts';
import { getReceipt, patientAccount, postCharge, postPayment } from '../src/server/finance/service.ts';
import { AppError } from '../src/server/http/errors.ts';
import { saveMessageTemplates, whatsappLink } from '../src/server/messaging/click-to-chat.ts';
import { saveContactPreferences } from '../src/server/patient-profile/contact.ts';
import { createPatient } from '../src/server/patients/service.ts';
import { billTreatment, completeTreatment } from '../src/server/plans/completion.ts';
import { acceptPlan, createPlan, readPlan, savePlan } from '../src/server/plans/service.ts';
import { createScheduleResource, saveOpeningHours } from '../src/server/scheduling/settings.ts';

// Quick wins: charge and estimate discounts, estimate validity, the unpaid-balances list, WhatsApp click-to-chat
// links and wording, and the clinic logo frozen on receipts. Everything runs inside one rolled-back transaction.
const { MIGRATION_DATABASE_URL: url } = migrationEnvironment(process.env); requireLocalDatabase(url); const client = postgres(url, { ...connectionOptions(url), max: 1 }); const rollback = new Error('ROLLBACK_FIXTURES');
const code = (c: string) => (e: unknown) => e instanceof AppError && e.code === c; const op = () => randomUUID();
const tz = 'Asia/Karachi'; const today = businessDate(tz);
const prefs = (over: object = {}) => ({ doNotContact: false, preferredChannel: 'whatsapp', channels: { phone: true, sms: false, whatsapp: true, email: false }, purposes: { appointment: true, recall: true, billing: true, marketing: false }, note: '', source: 'in_person', ...over });
// A real 1×1 PNG, padded so it is the size of a small logo.
const png = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'), Buffer.alloc(200)]);
const pngUrl = `data:image/png;base64,${png.toString('base64')}`;

try { try { await drizzle(client).transaction(async tx => {
  await tx.execute(sql`select pg_advisory_xact_lock(73492051)`);
  const [clinic] = await tx.insert(clinics).values({ name: 'Synthetic Smiles', currency: 'PKR', timezone: tz, phone: '042 111 2222' }).returning();
  const [branch] = await tx.insert(branches).values({ clinicId: clinic.id, name: 'Main branch' }).returning();
  const [other] = await tx.insert(clinics).values({ name: 'Other clinic', currency: 'PKR', timezone: tz }).returning();
  const [otherBranch] = await tx.insert(branches).values({ clinicId: other.id, name: 'Other branch' }).returning();
  const person = async (clinicId: string, branchId: string, permissions: string[]) => { const authUserId = randomUUID(); const [user] = await tx.insert(appUsers).values({ authUserId, displayName: 'Synthetic staff' }).returning(); const [member] = await tx.insert(memberships).values({ clinicId, userId: user.id }).returning(); await tx.insert(membershipBranches).values({ clinicId, membershipId: member.id, branchId }); await tx.insert(membershipGrants).values(permissions.map(permission => ({ clinicId, membershipId: member.id, permission }))); return { authUserId, clinicId, branchId }; };
  const base = ['patient.demographics.read', 'patient.demographics.write', 'patient.clinical.read', 'billing.read', 'appointment.read', 'appointment.write', 'plan.read', 'schedule.configure'];
  const owner = await person(clinic.id, branch.id, [...base, 'charge.post', 'charge.discount', 'payment.post', 'plan.write', 'plan.accept', 'plan.complete', 'clinic.configure', 'communication.send', 'communication.preferences.write']);
  const reception = await person(clinic.id, branch.id, [...base, 'charge.post', 'payment.post', 'communication.send']);
  const dentist = await person(clinic.id, branch.id, [...base, 'plan.write']);
  const outsider = await person(other.id, otherBranch.id, [...base, 'charge.post', 'charge.discount', 'communication.send', 'clinic.configure']);
  await tx.execute(sql`set local role clinic_runtime`);
  const patient = await createPatient(tx, owner, { operationId: op(), name: 'Ayesha Synthetic', phone: '0300 4512778', email: '' });
  const landline = await createPatient(tx, owner, { operationId: op(), name: 'Landline Synthetic', phone: '042 3576 1234', email: '' });

  // Charge discount: needs charge.discount and a reason, must be less than the price, and the patient owes the rest.
  const charge = (who: typeof owner, amount: string, extra: object = {}) => postCharge(tx, who, { operationId: op(), patientId: patient.id, description: 'Scaling and polishing', amount, ...extra });
  await assert.rejects(charge(reception, '3000.00', { discount: '500.00', discountReason: 'Staff family' }), code('FORBIDDEN'));
  await assert.rejects(charge(owner, '3000.00', { discount: '500.00' }), code('INVALID_INPUT'));
  await assert.rejects(charge(owner, '3000.00', { discount: '3000.00', discountReason: 'Free visit' }), code('INVALID_INPUT'));
  const discounted = await charge(owner, '3000.00', { discount: '500.00', discountReason: 'Staff family' });
  assert.deepEqual([discounted.amountMinor, discounted.discountMinor, discounted.discountReason], [250000, 50000, 'Staff family']);
  await charge(reception, '1500.00', { discount: '', discountReason: '' }); // empty form fields mean no discount
  const account = await patientAccount(tx, owner, patient.id);
  assert.equal(account.balanceMinor, '400000');
  assert.ok(account.charges.some(c => c.discountMinor === 50000 && c.discountReason === 'Staff family'));
  const discountAudits = await tx.select().from(auditEvents).where(and(eq(auditEvents.entityId, discounted.id), eq(auditEvents.action, 'charge.discounted')));
  assert.equal(discountAudits.length, 1);

  // Estimate discount and validity: the past is refused, an expired estimate cannot be accepted, and billing a
  // completed item applies its share of the agreed discount even when reception (no discount permission) bills it.
  const item = { id: randomUUID(), description: 'Composite filling', tooth: '16', quantity: 2, unitPrice: '4000.00' };
  const crown = { id: randomUUID(), description: 'Crown', tooth: '26', quantity: 1, unitPrice: '12000.00' };
  const body = { title: 'Fillings and crown', note: '', items: [item, crown], discount: '2000.00', discountReason: 'Package price', validUntil: addDays(today, 30) };
  await assert.rejects(createPlan(tx, owner, { operationId: op(), patientId: patient.id, body: { ...body, validUntil: addDays(today, -1) } }), code('VALID_UNTIL_PAST'));
  await assert.rejects(createPlan(tx, owner, { operationId: op(), patientId: patient.id, body: { ...body, discount: '20000.00' } }), code('INVALID_INPUT'));
  const plan = await createPlan(tx, owner, { operationId: op(), patientId: patient.id, body });
  const snap = (await readPlan(tx, owner, plan.id)).versions[0].snapshot;
  assert.deepEqual([snap.subtotalMinor, snap.discountMinor, snap.totalMinor, snap.validUntil], ['2000000', '200000', '1800000', addDays(today, 30)]);
  // Versions are immutable (a trigger refuses edits), so triggers are paused for this one fixture change to put the
  // saved date in the past and prove acceptance checks validity at acceptance time.
  await tx.execute(sql`reset role`); await tx.execute(sql`set local session_replication_role = replica`); await tx.execute(sql`update clinic_app.plan_versions set snapshot = jsonb_set(snapshot, '{validUntil}', to_jsonb(${addDays(today, -2)}::text)) where plan_id = ${plan.id}`); await tx.execute(sql`set local session_replication_role = origin`); await tx.execute(sql`set local role clinic_runtime`);
  await assert.rejects(acceptPlan(tx, owner, plan.id, { operationId: op(), expectedVersion: plan.version, acceptedBy: 'Ayesha Synthetic', evidence: 'Signed estimate' }), code('ESTIMATE_EXPIRED'));
  const renewed = await savePlan(tx, owner, plan.id, { operationId: op(), expectedVersion: plan.version, body });
  await acceptPlan(tx, owner, plan.id, { operationId: op(), expectedVersion: renewed.version, acceptedBy: 'Ayesha Synthetic', evidence: 'Signed estimate' });
  const done = await completeTreatment(tx, owner, plan.id, { operationId: op(), expectedVersion: renewed.version, itemId: item.id, quantity: 2, performedOn: today, note: 'Both fillings placed' });
  const billed = await billTreatment(tx, reception, done.id, { operationId: op() });
  const bill = (await patientAccount(tx, owner, patient.id)).charges.find(c => c.id === billed.chargeId)!;
  // 8,000 of a 20,000 estimate carries 8/20 of the 2,000 discount: 800 off, 7,200 owed.
  assert.deepEqual([bill.amountMinor, bill.discountMinor], [720000, 80000]);
  assert.match(bill.discountReason, /^Estimate discount: Package price/);

  // Unpaid balances: totals equal the account balance; paid-up patients are not listed; other clinics see nothing.
  const firstPaid = await postPayment(tx, owner, { operationId: op(), patientId: patient.id, amount: '1000.00', method: 'Easypaisa', paidOn: today });
  const owed = (await patientAccount(tx, owner, patient.id)).balanceMinor;
  const dues = await unpaidBalances(tx, owner, {});
  assert.deepEqual([dues.totalPatients, dues.totalMinor, dues.patients[0].balanceMinor, dues.patients[0].lastPaidOn, dues.patients[0].daysOutstanding], [1, owed, owed, today, 0]);
  assert.equal((await unpaidBalances(tx, owner, { sort: 'oldest' })).patients[0].id, patient.id);
  assert.equal((await unpaidBalances(tx, outsider, {})).totalPatients, 0);
  await assert.rejects(unpaidBalances(tx, owner, { sort: 'name' }), code('INVALID_INPUT'));

  // WhatsApp links: filled from real records, international number, audited; contact preferences and phone checked.
  const link = await whatsappLink(tx, reception, { patientId: patient.id, template: 'payment_due' });
  assert.equal(link.number, '923004512778');
  assert.ok(link.url.startsWith('https://wa.me/923004512778?text='));
  assert.ok(link.text.includes('Ayesha Synthetic') && link.text.includes('Synthetic Smiles') && link.text.includes(`Rs ${new Intl.NumberFormat('en-PK').format(Number(owed) / 100)}`) && link.text.includes('042 111 2222'), link.text);
  assert.equal((await tx.select().from(auditEvents).where(and(eq(auditEvents.entityId, patient.id), eq(auditEvents.action, 'message.whatsapp_opened:payment_due')))).length, 1);
  // The receipt message is a full itemised receipt: number, method, what was paid for, and the balance after it.
  const receiptText = (await whatsappLink(tx, reception, { patientId: patient.id, template: 'payment_received', receiptId: firstPaid.receipt.id })).text;
  assert.ok(receiptText.includes(firstPaid.receipt.number) && receiptText.includes('Amount paid: *Rs 1,000* (Easypaisa)') && /Paid for:\n• .+: Rs 1,000\n/.test(receiptText) && receiptText.includes(`Remaining balance: *Rs ${new Intl.NumberFormat('en-PK').format(Number(owed) / 100)}*`), receiptText);
  await assert.rejects(whatsappLink(tx, reception, { patientId: patient.id, template: 'payment_received' }), code('RECEIPT_REQUIRED'));
  await assert.rejects(whatsappLink(tx, dentist, { patientId: patient.id, template: 'recall' }), code('FORBIDDEN'));
  await assert.rejects(whatsappLink(tx, outsider, { patientId: patient.id, template: 'recall' }), code('PATIENT_NOT_FOUND'));
  await assert.rejects(whatsappLink(tx, owner, { patientId: landline.id, template: 'recall' }), code('PHONE_NOT_WHATSAPP'));
  await assert.rejects(whatsappLink(tx, owner, { patientId: landline.id, template: 'payment_due' }), code('PHONE_NOT_WHATSAPP'));
  const estimateLink = await whatsappLink(tx, owner, { patientId: patient.id, template: 'estimate', planId: plan.id });
  assert.ok(estimateLink.text.includes('Rs 18,000'), estimateLink.text);
  // Appointment messages need the appointment and show its clinic-time date, time and dentist.
  const hours = Object.fromEntries(['1', '2', '3', '4', '5', '6', '7'].map(d => [d, [['09:00', '17:00']]]));
  await saveOpeningHours(tx, owner, { operationId: op(), expectedVersion: 0, slotMinutes: 15, weeklyHours: hours });
  const dr = await createScheduleResource(tx, owner, { kind: 'dentist', operationId: op(), name: 'Dr. Synthetic', color: '#185d55', membershipId: null }) as { id: string };
  const day = addDays(today, 3); const start = zonedInstant(tz, day, '16:30');
  const appt = await bookAppointment(tx, owner, { operationId: op(), patientId: patient.id, startsAt: start.toISOString(), endsAt: new Date(+start + 30 * 60000).toISOString(), dentistId: dr.id, chairId: null, procedureId: null, reason: '', source: 'phone', nextAction: '' }) as { appointment: { id: string } } | { id: string };
  const appointmentId = 'appointment' in appt ? appt.appointment.id : appt.id;
  await assert.rejects(whatsappLink(tx, owner, { patientId: patient.id, template: 'appointment_reminder' }), code('APPOINTMENT_REQUIRED'));
  const reminder = await whatsappLink(tx, owner, { patientId: patient.id, template: 'appointment_reminder', appointmentId });
  assert.ok(reminder.text.includes('4:30 PM') && reminder.text.includes('Dr. Synthetic'), reminder.text);
  // A patient who asked not to get billing messages on WhatsApp is refused for billing, still reachable for recalls.
  await saveContactPreferences(tx, owner, patient.id, { operationId: op(), expectedVersion: 0, body: prefs({ purposes: { appointment: true, recall: true, billing: false, marketing: false } }), reason: 'Patient asked at reception' });
  await assert.rejects(whatsappLink(tx, owner, { patientId: patient.id, template: 'payment_due' }), code('CONTACT_NOT_ALLOWED'));
  await whatsappLink(tx, owner, { patientId: patient.id, template: 'recall' });

  // Wording: owner only, versioned, placeholders checked, and the clinic's text is what the link uses.
  const v1 = (await readClinicSettings(tx, owner)).settings.version;
  await assert.rejects(saveMessageTemplates(tx, reception, { expectedVersion: v1, templates: { recall: 'Hello {patient}, please visit {clinic} soon.' } }), code('FORBIDDEN'));
  await assert.rejects(saveMessageTemplates(tx, owner, { expectedVersion: v1, templates: { recall: 'Hello {patient}, you owe {balance}.' } }), code('TEMPLATE_INVALID'));
  const saved = await saveMessageTemplates(tx, owner, { expectedVersion: v1, templates: { recall: 'Hello {patient}, {clinic} is waiting for your check-up!' } });
  await assert.rejects(saveMessageTemplates(tx, owner, { expectedVersion: v1, templates: {} }), code('SETTINGS_CONFLICT'));
  assert.equal((await whatsappLink(tx, owner, { patientId: patient.id, template: 'recall' })).text, 'Hello Ayesha Synthetic, Synthetic Smiles is waiting for your check-up!');
  assert.equal((await readClinicSettings(tx, outsider)).messageTemplates.find(t => t.key === 'recall')?.custom, false);

  // Logo: real image bytes only, owner only; a receipt keeps the logo it was issued with after the logo changes.
  await assert.rejects(saveClinicLogo(tx, owner, { expectedVersion: saved.version, dataUrl: `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'.repeat(5)).toString('base64')}` }), code('LOGO_INVALID'));
  await assert.rejects(saveClinicLogo(tx, owner, { expectedVersion: saved.version, dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }), code('INVALID_INPUT'));
  await assert.rejects(saveClinicLogo(tx, reception, { expectedVersion: saved.version, dataUrl: pngUrl }), code('FORBIDDEN'));
  const logo = await saveClinicLogo(tx, owner, { expectedVersion: saved.version, dataUrl: pngUrl });
  assert.equal(logo.logo?.dataUrl, pngUrl);
  const paid = await postPayment(tx, owner, { operationId: op(), patientId: patient.id, amount: '500.00', method: 'Cash', paidOn: today });
  const removed = await saveClinicLogo(tx, owner, { expectedVersion: logo.version, remove: true });
  assert.equal(removed.logo, null);
  assert.equal((await readClinicSettings(tx, owner)).logo, null);
  assert.equal((await getReceipt(tx, owner, paid.receipt.id)).logo?.dataUrl, pngUrl);
  assert.equal((await readClinicSettings(tx, outsider)).logo, null);
  throw rollback;
}); } catch (e) { if (e !== rollback) throw e; } console.log('Quick wins integration passed: charge discounts (permission, reason, limit, audit), estimate discount and validity with proportional discount billing, unpaid balances matching accounts, WhatsApp links (filled, audited, permission, contact preferences, phone, clinic wording), and logos frozen on receipts. Fixtures rolled back.'); }
catch (e) { console.error('Quick wins integration failed.', e instanceof assert.AssertionError ? e.message : e instanceof AppError ? `${e.code}: ${e.message}` : e); process.exitCode = 1; } finally { await client.end(); }

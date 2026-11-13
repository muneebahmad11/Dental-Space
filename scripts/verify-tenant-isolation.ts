import './load-env.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { migrationEnvironment, requireLocalDatabase, connectionOptions } from '../src/lib/config/environment.ts';
import { businessDate } from '../src/lib/finance/contracts.ts';
import { addDays, zonedInstant } from '../src/lib/scheduling/contracts.ts';
import type { Database } from '../src/server/auth/context.ts';
import { AppError } from '../src/server/http/errors.ts';
import { acceptInvites, createClinic } from '../src/server/operator/service.ts';
import type { PatientScope } from '../src/server/patients/service.ts';
import * as appointments from '../src/server/appointments/service.ts';
import { listAuditEvents } from '../src/server/audit/query.ts';
import * as settings from '../src/server/clinic/settings.ts';
import * as closing from '../src/server/closing/service.ts';
import * as expenses from '../src/server/expenses/service.ts';
import * as finance from '../src/server/finance/service.ts';
import * as followUps from '../src/server/follow-ups/service.ts';
import * as messaging from '../src/server/messaging/service.ts';
import * as clickToChat from '../src/server/messaging/click-to-chat.ts';
import * as dues from '../src/server/finance/dues.ts';
import { clinicOverview } from '../src/server/overview/query.ts';
import * as clinical from '../src/server/patient-clinical/service.ts';
import * as contact from '../src/server/patient-profile/contact.ts';
import * as profile from '../src/server/patient-profile/service.ts';
import * as recent from '../src/server/patients/recent.ts';
import * as patients from '../src/server/patients/service.ts';
import * as completion from '../src/server/plans/completion.ts';
import * as plans from '../src/server/plans/service.ts';
import * as procedures from '../src/server/procedures/service.ts';
import { financeReport } from '../src/server/reports/service.ts';
import * as scheduling from '../src/server/scheduling/settings.ts';
import * as staff from '../src/server/staff/service.ts';
import { patientTimeline } from '../src/server/timeline/service.ts';
import * as visits from '../src/server/visits/service.ts';
import { staffRouteCalls } from './staff-route-calls.ts';

// Two clinics with a full set of records each. A fully-permitted user of clinic A then tries every staff route
// service against clinic B's IDs. Each attempt must be refused, must leak nothing, and must leave B untouched.
const { MIGRATION_DATABASE_URL: url } = migrationEnvironment(process.env); requireLocalDatabase(url); const client = postgres(url, { ...connectionOptions(url), max: 1 }); const rollback = new Error('ROLLBACK_FIXTURES'); const undo = new Error('UNDO');
const timezone = 'Asia/Karachi'; const today = businessDate(timezone); const day = addDays(today, 3); const op = () => randomUUID();
const at = (time: string, minutes = 30) => { const start = zonedInstant(timezone, day, time); return { startsAt: start.toISOString(), endsAt: new Date(+start + minutes * 60000).toISOString() }; };
const note = { complaint: 'Synthetic complaint', history: '', examination: '', assessment: 'Synthetic assessment', treatment: 'Synthetic treatment', advice: '', followUpOn: '' };
const prefs = { doNotContact: false, preferredChannel: 'whatsapp', channels: { phone: true, sms: false, whatsapp: true, email: false }, purposes: { appointment: true, recall: true, billing: true, marketing: false }, note: '', source: 'in_person' };
type Row = { id: string; version: number };
async function build(db: Database, s: PatientScope, label: string, phone: string) {
  const person = { dob: '1990-01-01', reportedAge: null, ageAsOf: null, gender: 'Female', address: `${label} Street`, alternatePhone: '', emergencyName: `${label} Contact`, emergencyPhone: '', emergencyRelationship: 'Relative', status: 'active' };
  const history = { medicalHistory: `${label} medical history`, dentalHistory: `${label} dental history`, medications: 'None', allergies: 'None known', tobaccoHistory: 'None reported', source: 'Patient interview', reviewedOn: today };
  const hours = Object.fromEntries(['1', '2', '3', '4', '5', '6', '7'].map(d => [d, [['09:00', '17:00']]]));
  await scheduling.saveOpeningHours(db, s, { operationId: op(), expectedVersion: 0, slotMinutes: 15, weeklyHours: hours });
  const dentist = await scheduling.createScheduleResource(db, s, { kind: 'dentist', operationId: op(), name: `Dr. ${label}`, color: '#185d55', membershipId: null }) as Row;
  const chair = await scheduling.createScheduleResource(db, s, { kind: 'chair', operationId: op(), name: `${label} chair` }) as Row;
  const closure = await scheduling.addClosure(db, s, { operationId: op(), closedOn: addDays(today, 40), reason: `${label} holiday` }) as Row;
  const procedure = await procedures.createProcedure(db, s, { operationId: op(), code: '', name: `${label} procedure`, category: 'Consultation', defaultMinutes: 30, price: '1500.00' });
  const patient = await patients.createPatient(db, s, { operationId: op(), name: `${label} Patient`, phone, email: '' }) as { id: string };
  await profile.savePatientProfile(db, s, patient.id, { operationId: op(), expectedVersion: 0, reason: 'Recorded at registration', body: person });
  await clinical.savePatientHistory(db, s, patient.id, { operationId: op(), expectedVersion: 0, reason: 'Initial history', body: history });
  const alert = await clinical.createPatientAlert(db, s, patient.id, { operationId: op(), reason: 'History review', body: { type: 'allergy', severity: 'critical', text: `${label} allergy alert`, active: true } }) as Row;
  await contact.saveContactPreferences(db, s, patient.id, { operationId: op(), expectedVersion: 0, body: prefs, reason: 'Patient told reception' });
  const appointment = await appointments.bookAppointment(db, s, { operationId: op(), patientId: patient.id, ...at('10:00'), dentistId: dentist.id, chairId: chair.id, procedureId: procedure.id, reason: `${label} visit reason`, source: 'phone', nextAction: '' }) as Row;
  const visit = await visits.createVisit(db, s, { patientId: patient.id, operationId: op() }) as Row;
  await visits.saveVisitDraft(db, s, visit.id, { expectedVersion: visit.version, body: { ...note, complaint: `${label} complaint` } });
  const item = (description: string, quantity: number) => ({ id: randomUUID(), description, tooth: '16', quantity, unitPrice: '2500.00' });
  const openPlan = await plans.createPlan(db, s, { operationId: op(), patientId: patient.id, body: { title: `${label} open plan`, note: '', items: [item(`${label} filling`, 1)] } }) as Row;
  const acceptedItem = item(`${label} crown`, 2);
  const accepted = await plans.createPlan(db, s, { operationId: op(), patientId: patient.id, body: { title: `${label} accepted plan`, note: '', items: [acceptedItem] } }) as Row;
  await plans.acceptPlan(db, s, accepted.id, { operationId: op(), expectedVersion: accepted.version, acceptedBy: `${label} Patient`, evidence: 'Verbal agreement' });
  const done = await completion.completeTreatment(db, s, accepted.id, { operationId: op(), expectedVersion: (await plans.readPlan(db, s, accepted.id)).plan.version, itemId: acceptedItem.id, quantity: 1, performedOn: today, note: 'First unit done' }) as { id: string };
  const charge = await finance.postCharge(db, s, { operationId: op(), patientId: patient.id, description: `${label} paid charge`, amount: '10000.00' });
  const payment = await finance.postPayment(db, s, { operationId: op(), patientId: patient.id, amount: '4000.00', method: 'Cash', paidOn: today });
  const refund = await finance.postRefund(db, s, payment.payment.id, { operationId: op(), amount: '1000.00', paidOn: today, reason: `${label} refund reason` });
  const unpaid = await finance.postCharge(db, s, { operationId: op(), patientId: patient.id, description: `${label} unpaid charge`, amount: '500.00' });
  await finance.postCreditNote(db, s, unpaid.id, { operationId: op(), amount: '100.00', reason: `${label} credit reason` });
  await expenses.recordExpense(db, s, { operationId: op(), paidOn: today, description: `${label} expense`, category: 'Supplies', method: 'Cash', amount: '250.00' });
  const followUp = await followUps.createFollowUp(db, s, { operationId: op(), patientId: patient.id, visitId: null, type: 'Periodic check-up', customType: '', dueOn: addDays(today, 5), assigneeId: null, note: `${label} follow-up note` }) as Row;
  await closing.saveClosingDraft(db, s, { businessDate: addDays(today, -1), expectedVersion: 0, opening: '0', counted: '0', note: `${label} closing note` });
  const invite = await staff.inviteStaff(db, s, { operationId: op(), email: `${label.toLowerCase()}-reception@isolation.example`, displayName: `${label} Reception`, roleNames: ['reception'], branchId: s.branchId }, async () => 'not_sent');
  const me = (await staff.listStaff(db, s)).members.find(m => m.isSelf)!;
  return { label, phone, branchId: s.branchId, patientId: patient.id, dentistId: dentist.id, chairId: chair.id, closureId: closure.id, procedureId: procedure.id, alertId: alert.id, appointmentId: appointment.id, appointmentVersion: appointment.version,
    visitId: visit.id, visitVersion: (await visits.readVisit(db, s, visit.id)).visit.version, planId: openPlan.id, planVersion: openPlan.version, acceptedPlanId: accepted.id, acceptedPlanVersion: (await plans.readPlan(db, s, accepted.id)).plan.version, acceptedItemId: acceptedItem.id, completionId: done.id,
    chargeId: charge.id, unpaidChargeId: unpaid.id, paymentId: payment.payment.id, receiptId: payment.receipt.id, refundId: refund.id, followUpId: followUp.id, followUpVersion: (await followUps.readFollowUp(db, s, followUp.id)).followUp.version, inviteId: invite.inviteId, membershipId: me.id };
}
type Ids = Awaited<ReturnType<typeof build>>; type Call = (db: Database, s: PatientScope, x: Ids) => Promise<unknown>;
// Every service that takes a record ID (in its path or body). Run as clinic A with A's IDs it must work, which proves
// the payload is valid; run as clinic A with B's IDs it must be refused.
const byId: Record<string, Call> = {
  appointmentHistory: (db, s, x) => appointments.appointmentHistory(db, s, x.appointmentId),
  bookAppointment: (db, s, x) => appointments.bookAppointment(db, s, { operationId: op(), patientId: x.patientId, ...at('12:00'), dentistId: x.dentistId, chairId: x.chairId, procedureId: x.procedureId, reason: 'Second visit', source: 'phone', nextAction: '' }),
  changeAppointmentStatus: (db, s, x) => appointments.changeAppointmentStatus(db, s, x.appointmentId, { operationId: op(), expectedVersion: x.appointmentVersion, status: 'confirmed', note: '' }),
  rescheduleAppointment: (db, s, x) => appointments.rescheduleAppointment(db, s, x.appointmentId, { operationId: op(), expectedVersion: x.appointmentVersion, ...at('14:00'), dentistId: x.dentistId, chairId: x.chairId, note: 'Patient asked' }),
  updateAppointmentDetails: (db, s, x) => appointments.updateAppointmentDetails(db, s, x.appointmentId, { operationId: op(), expectedVersion: x.appointmentVersion, procedureId: x.procedureId, reason: 'Changed reason', notes: '', nextAction: '' }),
  getReceipt: (db, s, x) => finance.getReceipt(db, s, x.receiptId), getRefundReceipt: (db, s, x) => finance.getRefundReceipt(db, s, x.refundId), patientAccount: (db, s, x) => finance.patientAccount(db, s, x.patientId),
  postCharge: (db, s, x) => finance.postCharge(db, s, { operationId: op(), patientId: x.patientId, description: 'Attack charge', amount: '10.00' }),
  postPayment: (db, s, x) => finance.postPayment(db, s, { operationId: op(), patientId: x.patientId, amount: '100.00', method: 'Cash', paidOn: today }),
  postRefund: (db, s, x) => finance.postRefund(db, s, x.paymentId, { operationId: op(), amount: '100.00', paidOn: today, reason: 'Attack refund' }),
  postCreditNote: (db, s, x) => finance.postCreditNote(db, s, x.unpaidChargeId, { operationId: op(), amount: '50.00', reason: 'Attack credit' }),
  correctCharge: (db, s, x) => finance.correctCharge(db, s, x.unpaidChargeId, { operationId: op(), reason: 'Attack correction', description: 'Corrected', amount: '300.00' }),
  readFollowUp: (db, s, x) => followUps.readFollowUp(db, s, x.followUpId),
  createFollowUp: (db, s, x) => followUps.createFollowUp(db, s, { operationId: op(), patientId: x.patientId, visitId: null, type: 'Scaling recall', customType: '', dueOn: addDays(today, 9), assigneeId: null, note: 'Attack follow-up' }),
  mutateFollowUp: (db, s, x) => followUps.mutateFollowUp(db, s, x.followUpId, { action: 'contact', operationId: op(), expectedVersion: x.followUpVersion, channel: 'Phone', outcome: 'No answer', note: 'Attack call' }),
  bookFollowUp: (db, s, x) => followUps.bookFollowUp(db, s, x.followUpId, { operationId: op(), expectedVersion: x.followUpVersion, note: 'Booked from recall', ...at('15:00'), dentistId: x.dentistId, chairId: x.chairId, procedureId: null, override: null }),
  setMessagingPreference: (db, s, x) => messaging.setMessagingPreference(db, s, { patientId: x.patientId, enabled: true, expectedVersion: 0, evidence: 'Attack consent' }),
  readPatientClinical: (db, s, x) => clinical.readPatientClinical(db, s, x.patientId), readHistoryVersion: (db, s, x) => clinical.readHistoryVersion(db, s, x.patientId, 1), listPatientAlerts: (db, s, x) => clinical.listPatientAlerts(db, s, x.patientId), readPatientAlert: (db, s, x) => clinical.readPatientAlert(db, s, x.patientId, x.alertId),
  createPatientAlert: (db, s, x) => clinical.createPatientAlert(db, s, x.patientId, { operationId: op(), reason: 'Attack', body: { type: 'medical', severity: 'important', text: 'Attack alert', active: true } }),
  updatePatientAlert: (db, s, x) => clinical.updatePatientAlert(db, s, x.patientId, x.alertId, { operationId: op(), expectedVersion: 1, reason: 'Attack resolve', body: { type: 'allergy', severity: 'critical', text: 'Changed', active: false } }),
  savePatientHistory: (db, s, x) => clinical.savePatientHistory(db, s, x.patientId, { operationId: op(), expectedVersion: 1, reason: 'Attack history', body: { medicalHistory: 'Changed', dentalHistory: '', medications: '', allergies: '', tobaccoHistory: '', source: 'Attack', reviewedOn: today } }),
  readContactPreferences: (db, s, x) => contact.readContactPreferences(db, s, x.patientId), saveContactPreferences: (db, s, x) => contact.saveContactPreferences(db, s, x.patientId, { operationId: op(), expectedVersion: 1, body: { ...prefs, doNotContact: true, preferredChannel: 'none' }, reason: 'Attack preference' }),
  readPatientProfile: (db, s, x) => profile.readPatientProfile(db, s, x.patientId),
  savePatientProfile: (db, s, x) => profile.savePatientProfile(db, s, x.patientId, { operationId: op(), expectedVersion: 1, reason: 'Attack profile', body: { dob: '1980-01-01', reportedAge: null, ageAsOf: null, gender: 'Male', address: 'Changed', alternatePhone: '', emergencyName: 'Changed', emergencyPhone: '', emergencyRelationship: 'Relative', status: 'active' } }),
  recordPatientView: (db, s, x) => recent.recordPatientView(db, s, x.patientId),
  updatePatient: (db, s, x) => patients.updatePatient(db, s, x.patientId, 1, { name: 'Renamed by attack', phone: x.phone, email: '' }),
  billTreatment: (db, s, x) => completion.billTreatment(db, s, x.completionId, { operationId: op() }),
  completeTreatment: (db, s, x) => completion.completeTreatment(db, s, x.acceptedPlanId, { operationId: op(), expectedVersion: x.acceptedPlanVersion, itemId: x.acceptedItemId, quantity: 1, performedOn: today, note: 'Attack completion' }),
  readPlan: (db, s, x) => plans.readPlan(db, s, x.planId),
  createPlan: (db, s, x) => plans.createPlan(db, s, { operationId: op(), patientId: x.patientId, body: { title: 'Attack plan', note: '', items: [{ id: randomUUID(), description: 'Attack item', tooth: '', quantity: 1, unitPrice: '100.00' }] } }),
  savePlan: (db, s, x) => plans.savePlan(db, s, x.planId, { operationId: op(), expectedVersion: x.planVersion, body: { title: 'Changed plan', note: '', items: [{ id: randomUUID(), description: 'Changed item', tooth: '', quantity: 1, unitPrice: '100.00' }] } }),
  acceptPlan: (db, s, x) => plans.acceptPlan(db, s, x.planId, { operationId: op(), expectedVersion: x.planVersion, acceptedBy: 'Attacker', evidence: 'Attack evidence' }),
  procedureHistory: (db, s, x) => procedures.procedureHistory(db, s, x.procedureId),
  updateProcedure: (db, s, x) => procedures.updateProcedure(db, s, x.procedureId, { operationId: op(), expectedVersion: 1, code: '', name: 'Renamed procedure', category: 'Consultation', defaultMinutes: 30, price: '1.00', active: true }),
  updateScheduleResource: (db, s, x) => scheduling.updateScheduleResource(db, s, x.dentistId, { kind: 'dentist', operationId: op(), expectedVersion: 1, name: 'Dr. Renamed', color: '#185d55', membershipId: null, active: true }),
  cancelClosure: (db, s, x) => scheduling.cancelClosure(db, s, x.closureId, { operationId: op(), expectedVersion: 1 }),
  patientTimeline: (db, s, x) => patientTimeline(db, s, x.patientId),
  readVisit: (db, s, x) => visits.readVisit(db, s, x.visitId), createVisit: (db, s, x) => visits.createVisit(db, s, { patientId: x.patientId, operationId: op() }),
  saveVisitDraft: (db, s, x) => visits.saveVisitDraft(db, s, x.visitId, { expectedVersion: x.visitVersion, body: { ...note, complaint: 'Changed by attack' } }),
  signVisit: (db, s, x) => visits.signVisit(db, s, x.visitId, { expectedVersion: x.visitVersion, operationId: op() }),
  updateStaff: (db, s, x) => staff.updateStaff(db, s, x.membershipId, { operationId: op(), roleNames: ['dentist', 'owner'], grants: ['audit.read'], branchIds: [s.branchId], active: true }),
  whatsappLink: (db, s, x) => clickToChat.whatsappLink(db, s, { patientId: x.patientId, template: 'recall' }),
  whatsappAppointment: (db, s, x) => clickToChat.whatsappLink(db, s, { patientId: x.patientId, template: 'appointment_reminder', appointmentId: x.appointmentId }),
  revokeInvite: (db, s, x) => staff.revokeInvite(db, s, x.inviteId),
};
// These depend on the time of day or on messaging being configured, so only the refusal with B's IDs is checked.
const refusalOnly: Record<string, Call> = {
  registerWalkIn: (db, s, x) => appointments.registerWalkIn(db, s, { operationId: op(), patientId: x.patientId, dentistId: x.dentistId, chairId: null, procedureId: x.procedureId, minutes: 30, reason: 'Attack walk-in', notes: '' }),
  queueMessage: (db, s, x) => messaging.queueMessage(db, s, { patientId: x.patientId, operationId: op(), template: 'appointment_reminder', language: 'en', parameters: ['Attack'] }, null),
  cancelMessage: (db, s, x) => messaging.cancelMessage(db, s, x.appointmentId),
};
// Lists and searches run as clinic A, some filtered by B's IDs. Nothing of B's may appear in any result.
const lists: Record<string, (db: Database, s: PatientScope, b: Ids) => Promise<unknown>[]> = {
  listPatients: (db, s, b) => [patients.listPatients(db, s, { search: 'TENANT' }), patients.listPatients(db, s, { search: b.phone.slice(-7) }), patients.listPatients(db, s)],
  duplicateCandidates: (db, s, b) => [patients.duplicateCandidates(db, s, { name: 'TENANT_B Patient', phone: b.phone })],
  listRecentPatients: (db, s) => [recent.listRecentPatients(db, s)],
  listAppointments: (db, s, b) => { const range = { startsAt: zonedInstant(timezone, today, '00:00').toISOString(), endsAt: zonedInstant(timezone, addDays(today, 20), '00:00').toISOString() }; return [appointments.listAppointments(db, s, range), appointments.listAppointments(db, s, { ...range, patientId: b.patientId }), appointments.listAppointments(db, s, { ...range, dentistId: b.dentistId })]; },
  listVisits: (db, s) => [visits.listVisits(db, s, {})], listPlans: (db, s) => [plans.listPlans(db, s)],
  listFollowUps: (db, s, b) => [followUps.listFollowUps(db, s, {}), followUps.listFollowUps(db, s, { patientId: b.patientId }), followUps.listFollowUps(db, s, { assigneeId: b.membershipId })], followUpStaff: (db, s) => [followUps.followUpStaff(db, s)],
  listExpenses: (db, s) => [expenses.listExpenses(db, s, { paidOn: today })],
  listCommunications: (db, s, b) => [messaging.listCommunications(db, s, {}, null), messaging.listCommunications(db, s, { patientId: b.patientId }, null)],
  clinicOverview: (db, s) => [clinicOverview(db, s, { startsAt: zonedInstant(timezone, day, '00:00').toISOString(), endsAt: zonedInstant(timezone, addDays(day, 1), '00:00').toISOString() })],
  financeReport: (db, s) => [financeReport(db, s, { from: addDays(today, -5), to: today })], closingSummary: (db, s) => [closing.closingSummary(db, s, today), closing.closingSummary(db, s, addDays(today, -1))],
  listProcedures: (db, s) => [procedures.listProcedures(db, s, {}), procedures.listProcedures(db, s, { search: 'TENANT_B' })], getScheduleSettings: (db, s) => [scheduling.getScheduleSettings(db, s)],
  listAuditEvents: (db, s) => [listAuditEvents(db, s)], readClinicSettings: (db, s) => [settings.readClinicSettings(db, s)], listPaymentMethods: (db, s) => [settings.listPaymentMethods(db, s)], listStaff: (db, s) => [staff.listStaff(db, s)], unpaidBalances: (db, s) => [dues.unpaidBalances(db, s, {}), dues.unpaidBalances(db, s, { sort: 'oldest' })],
};
// These act only inside the caller's own clinic and take no record ID; the swapped-scope check below covers them.
const scopeOnly = ['saveClosingDraft', 'approveClosing', 'recordExpense', 'createPatient', 'importStarterProcedures', 'createProcedure', 'addClosure', 'createScheduleResource', 'saveOpeningHours', 'saveClinicSettings', 'setPaymentMethod', 'inviteStaff', 'saveMessageTemplates', 'saveClinicLogo'];
// A refusal is 403 or 404. Three services answer a foreign ID exactly like a stale version (409, no data), and
// messaging is switched off, so sending answers 503 after the access check has passed for the caller's own clinic.
const alsoRefused: Record<string, string> = { updatePatient: 'PATIENT_CONFLICT', saveVisitDraft: 'VISIT_CONFLICT', cancelMessage: 'MESSAGE_CONFLICT', queueMessage: 'WHATSAPP_NOT_CONFIGURED' };
const refused = (e: unknown, name = '') => e instanceof AppError && (e.status === 403 || e.status === 404 || e.code === alsoRefused[name]);
async function snapshot(db: Database, clinicId: string) {
  const tables = await db.execute<{ name: string }>(sql`select table_name as name from information_schema.columns where table_schema='clinic_app' and column_name='clinic_id' order by table_name`);
  const parts: string[] = [];
  for (const { name } of tables) { const [row] = await db.execute<{ n: number; h: string }>(sql`select count(*)::int as n, coalesce(md5(string_agg(t::text, '|' order by t::text)), '') as h from ${sql.raw(`clinic_app."${name}"`)} t where t.clinic_id=${clinicId}`); parts.push(`${name}:${row.n}:${row.h}`); }
  return parts;
}
try { try { await drizzle(client).transaction(async tx => {
  await tx.execute(sql`select pg_advisory_xact_lock(73492041)`);
  const operatorAuth = randomUUID(); await tx.execute(sql`insert into clinic_app.platform_operators(auth_user_id,display_name) values (${operatorAuth},'Synthetic operator')`);
  await tx.execute(sql`set local role clinic_runtime`);
  const clinicFor = async (name: string) => { const email = `${name.toLowerCase()}@isolation.example`; const created = await createClinic(tx, operatorAuth, { operationId: op(), name: `${name} Clinic`, owner: { email, displayName: `${name} Owner`, alsoDentist: true } }, async () => 'not_sent'); const authUserId = randomUUID(); assert.equal(await acceptInvites(tx, authUserId, email, async () => true), 1); return { authUserId, clinicId: created.clinicId, branchId: created.branchId }; };
  const a = await clinicFor('TENANT_A'); const b = await clinicFor('TENANT_B');
  const idsA = await build(tx, a, 'TENANT_A', '+92 300 1110001'); const idsB = await build(tx, b, 'TENANT_B', '+92 300 2220002');

  // The suite must cover every service function that a staff API route uses.
  const covered = new Set([...Object.keys(byId), ...Object.keys(refusalOnly), ...Object.keys(lists), ...scopeOnly]);
  assert.deepEqual(Object.keys(staffRouteCalls(idsA.patientId)).filter(name => !covered.has(name)), [], 'Add the new route service to scripts/verify-tenant-isolation.ts');

  await tx.execute(sql`reset role`); const before = await snapshot(tx, b.clinicId); assert.ok(before.filter(p => !p.includes(':0:')).length >= 30, 'clinic B fixture is too thin'); await tx.execute(sql`set local role clinic_runtime`);
  const problems: string[] = [];
  for (const [name, call] of Object.entries(byId)) {
    // With its own IDs the call works, so a refusal below is about the clinic boundary and not a malformed request.
    try { await tx.transaction(async n => { await call(n as Database, a, idsA); throw undo; }); } catch (e) { if (e !== undo) problems.push(`${name}: own-clinic call failed (${e instanceof AppError ? e.code : (e as Error).message})`); }
  }
  for (const [name, call] of Object.entries({ ...byId, ...refusalOnly })) {
    try { const result = await tx.transaction(n => call(n as Database, a, idsB)); problems.push(`${name}: clinic A reached clinic B (${JSON.stringify(result).slice(0, 80)})`); }
    catch (e) { if (!refused(e, name)) problems.push(`${name}: expected 403/404, got ${e instanceof AppError ? `${e.status} ${e.code}` : (e as Error).message}`); }
  }
  // One of A's records combined with one of B's is refused as well.
  const mixed: Record<string, Call> = {
    'bookAppointment with B dentist': (db, s, x) => byId.bookAppointment(db, s, { ...idsA, dentistId: x.dentistId }), 'bookAppointment with B chair': (db, s, x) => byId.bookAppointment(db, s, { ...idsA, chairId: x.chairId }), 'bookAppointment with B procedure': (db, s, x) => byId.bookAppointment(db, s, { ...idsA, procedureId: x.procedureId }),
    'rescheduleAppointment to B dentist': (db, s, x) => byId.rescheduleAppointment(db, s, { ...idsA, dentistId: x.dentistId }), 'updateAppointmentDetails with B procedure': (db, s, x) => byId.updateAppointmentDetails(db, s, { ...idsA, procedureId: x.procedureId }),
    'readPatientAlert with B alert': (db, s, x) => byId.readPatientAlert(db, s, { ...idsA, alertId: x.alertId }), 'updatePatientAlert with B alert': (db, s, x) => byId.updatePatientAlert(db, s, { ...idsA, alertId: x.alertId }),
    'whatsappLink with B appointment': (db, s, x) => clickToChat.whatsappLink(db, s, { patientId: idsA.patientId, template: 'appointment_reminder', appointmentId: x.appointmentId }),
    'createVisit with B appointment': (db, s, x) => visits.createVisit(db, s, { patientId: idsA.patientId, appointmentId: x.appointmentId, operationId: op() }),
    'createFollowUp assigned to B staff': (db, s, x) => followUps.createFollowUp(db, s, { operationId: op(), patientId: idsA.patientId, visitId: null, type: 'Scaling recall', customType: '', dueOn: addDays(today, 9), assigneeId: x.membershipId, note: 'Attack' }),
    'createFollowUp for B visit': (db, s, x) => followUps.createFollowUp(db, s, { operationId: op(), patientId: idsA.patientId, visitId: x.visitId, type: 'Scaling recall', customType: '', dueOn: addDays(today, 9), assigneeId: null, note: 'Attack' }),
    'bookFollowUp with B dentist': (db, s, x) => byId.bookFollowUp(db, s, { ...idsA, dentistId: x.dentistId }), 'completeTreatment with B item': (db, s, x) => byId.completeTreatment(db, s, { ...idsA, acceptedItemId: x.acceptedItemId }),
    'updateStaff into B branch': (db, s, x) => staff.updateStaff(db, s, idsA.membershipId, { operationId: op(), roleNames: ['dentist', 'owner'], grants: [], branchIds: [x.branchId], active: true }),
    'inviteStaff into B branch': (db, s, x) => staff.inviteStaff(db, s, { operationId: op(), email: 'attack@isolation.example', displayName: 'Attack', roleNames: ['reception'], branchId: x.branchId }, async () => 'not_sent'),
  };
  for (const [name, call] of Object.entries(mixed)) {
    try { await tx.transaction(n => call(n as Database, a, idsB)); problems.push(`${name}: accepted`); }
    catch (e) { if (!(e instanceof AppError && e.status >= 400 && e.status < 500)) problems.push(`${name}: ${(e as Error).message}`); }
  }
  // Nothing of B's shows in A's lists, searches or reports, even when filtered by B's IDs.
  const secrets = ['TENANT_B', 'tenant_b', b.clinicId, ...Object.values(idsB).filter((v): v is string => typeof v === 'string' && v.length === 36)];
  for (const [name, run] of Object.entries(lists)) for (const [i, pending] of run(tx, a, idsB).entries()) {
    try { const text = JSON.stringify(await pending); const leak = secrets.find(secret => text.includes(secret)); if (leak) problems.push(`${name}#${i}: leaked ${leak}`); }
    catch (e) { if (!(e instanceof AppError && e.status >= 400 && e.status < 500)) problems.push(`${name}#${i}: ${(e as Error).message}`); }
  }
  assert.ok(JSON.stringify(await patients.listPatients(tx, a, { search: 'TENANT' })).includes('TENANT_A Patient'));
  assert.equal((await financeReport(tx, a, { from: today, to: today })).totals.receiptsMinor, '400000');
  // Naming B's clinic and branch as the scope gets A's user nowhere: membership is checked for every service.
  for (const [name, call] of Object.entries(staffRouteCalls(idsB.patientId))) {
    try { await tx.transaction(n => call(n as Database, { authUserId: a.authUserId, clinicId: b.clinicId, branchId: b.branchId })); problems.push(`${name}: swapped scope accepted`); }
    catch (e) { if (!(e instanceof AppError && (e.code === 'FORBIDDEN' || e.status === 400))) problems.push(`${name}: swapped scope gave ${(e as Error).message}`); }
  }
  for (const [name, call] of Object.entries({ ...byId, ...refusalOnly })) {
    try { await tx.transaction(n => call(n as Database, { authUserId: a.authUserId, clinicId: b.clinicId, branchId: b.branchId }, idsB)); problems.push(`${name}: swapped scope with valid request accepted`); }
    catch (e) { if (!(e instanceof AppError && e.code === 'FORBIDDEN')) problems.push(`${name}: swapped scope with valid request gave ${e instanceof AppError ? e.code : (e as Error).message}`); }
  }
  assert.deepEqual(problems, []);
  // After every attempt, each of clinic B's rows in every table is exactly as it was.
  await tx.execute(sql`reset role`); assert.deepEqual(await snapshot(tx, b.clinicId), before); await tx.execute(sql`set local role clinic_runtime`);
  assert.equal((await finance.patientAccount(tx, b, idsB.patientId)).balanceMinor, '740000');
  throw rollback;
}); } catch (e) { if (e !== rollback) throw e; } console.log(`Tenant isolation passed: ${Object.keys(byId).length + Object.keys(refusalOnly).length} ID-taking services refused clinic B's records (each proven valid against the caller's own clinic first), mixed-clinic requests refused, ${Object.keys(lists).length} lists and reports leaked nothing, swapped scope refused everywhere, and every row of clinic B was unchanged. Fixtures rolled back.`); }
catch (e) { console.error('Tenant isolation failed.', e instanceof assert.AssertionError ? e.message : e instanceof AppError ? e.code : e); process.exitCode = 1; } finally { await client.end(); }

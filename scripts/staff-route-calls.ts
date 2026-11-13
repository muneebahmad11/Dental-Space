import { randomUUID } from 'node:crypto';
import type { Database } from '../src/server/auth/context.ts';
import type { PatientScope } from '../src/server/patients/service.ts';
import * as appointments from '../src/server/appointments/service.ts';
import { listAuditEvents } from '../src/server/audit/query.ts';
import * as staff from '../src/server/staff/service.ts';
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
import { patientTimeline } from '../src/server/timeline/service.ts';
import * as visits from '../src/server/visits/service.ts';

export type StaffCall = (db: Database, scope: PatientScope) => Promise<unknown>;
// One call per service function used by a staff API route. Access suites run each one as a caller who must be
// refused (suspended clinic, platform operator, other clinic) and expect the refusal before any input is read.
export function staffRouteCalls(patientId: string): Record<string, StaffCall> {
  const id = randomUUID(); const body = {};
  return {
    listAppointments: (db, s) => appointments.listAppointments(db, s, body), appointmentHistory: (db, s) => appointments.appointmentHistory(db, s, id), bookAppointment: (db, s) => appointments.bookAppointment(db, s, body),
    registerWalkIn: (db, s) => appointments.registerWalkIn(db, s, body), changeAppointmentStatus: (db, s) => appointments.changeAppointmentStatus(db, s, id, body), rescheduleAppointment: (db, s) => appointments.rescheduleAppointment(db, s, id, body), updateAppointmentDetails: (db, s) => appointments.updateAppointmentDetails(db, s, id, body),
    listAuditEvents: (db, s) => listAuditEvents(db, s),
    listStaff: (db, s) => staff.listStaff(db, s), inviteStaff: (db, s) => staff.inviteStaff(db, s, body, async () => 'not_sent'), revokeInvite: (db, s) => staff.revokeInvite(db, s, id), updateStaff: (db, s) => staff.updateStaff(db, s, id, body),
    readClinicSettings: (db, s) => settings.readClinicSettings(db, s), saveClinicSettings: (db, s) => settings.saveClinicSettings(db, s, body), listPaymentMethods: (db, s) => settings.listPaymentMethods(db, s), setPaymentMethod: (db, s) => settings.setPaymentMethod(db, s, body),
    closingSummary: (db, s) => closing.closingSummary(db, s, body), saveClosingDraft: (db, s) => closing.saveClosingDraft(db, s, body), approveClosing: (db, s) => closing.approveClosing(db, s, body),
    listExpenses: (db, s) => expenses.listExpenses(db, s, body), recordExpense: (db, s) => expenses.recordExpense(db, s, body),
    getReceipt: (db, s) => finance.getReceipt(db, s, id), getRefundReceipt: (db, s) => finance.getRefundReceipt(db, s, id), patientAccount: (db, s) => finance.patientAccount(db, s, patientId), postCharge: (db, s) => finance.postCharge(db, s, body), postCreditNote: (db, s) => finance.postCreditNote(db, s, id, body), correctCharge: (db, s) => finance.correctCharge(db, s, id, body), postPayment: (db, s) => finance.postPayment(db, s, body), postRefund: (db, s) => finance.postRefund(db, s, id, body),
    bookFollowUp: (db, s) => followUps.bookFollowUp(db, s, id, body), createFollowUp: (db, s) => followUps.createFollowUp(db, s, body), listFollowUps: (db, s) => followUps.listFollowUps(db, s, body), followUpStaff: (db, s) => followUps.followUpStaff(db, s), readFollowUp: (db, s) => followUps.readFollowUp(db, s, id), mutateFollowUp: (db, s) => followUps.mutateFollowUp(db, s, id, body),
    cancelMessage: (db, s) => messaging.cancelMessage(db, s, id), listCommunications: (db, s) => messaging.listCommunications(db, s, body, null), queueMessage: (db, s) => messaging.queueMessage(db, s, body, null), setMessagingPreference: (db, s) => messaging.setMessagingPreference(db, s, body),
    clinicOverview: (db, s) => clinicOverview(db, s, body),
    whatsappLink: (db, s) => clickToChat.whatsappLink(db, s, body), saveMessageTemplates: (db, s) => clickToChat.saveMessageTemplates(db, s, body), unpaidBalances: (db, s) => dues.unpaidBalances(db, s, body), saveClinicLogo: (db, s) => settings.saveClinicLogo(db, s, body),
    listPatientAlerts: (db, s) => clinical.listPatientAlerts(db, s, patientId), createPatientAlert: (db, s) => clinical.createPatientAlert(db, s, patientId, body), readHistoryVersion: (db, s) => clinical.readHistoryVersion(db, s, patientId, 1), readPatientAlert: (db, s) => clinical.readPatientAlert(db, s, patientId, id), updatePatientAlert: (db, s) => clinical.updatePatientAlert(db, s, patientId, id, body), readPatientClinical: (db, s) => clinical.readPatientClinical(db, s, patientId), savePatientHistory: (db, s) => clinical.savePatientHistory(db, s, patientId, body),
    readContactPreferences: (db, s) => contact.readContactPreferences(db, s, patientId), saveContactPreferences: (db, s) => contact.saveContactPreferences(db, s, patientId, body),
    readPatientProfile: (db, s) => profile.readPatientProfile(db, s, patientId), savePatientProfile: (db, s) => profile.savePatientProfile(db, s, patientId, body),
    listRecentPatients: (db, s) => recent.listRecentPatients(db, s), recordPatientView: (db, s) => recent.recordPatientView(db, s, patientId),
    createPatient: (db, s) => patients.createPatient(db, s, body), listPatients: (db, s) => patients.listPatients(db, s, body), duplicateCandidates: (db, s) => patients.duplicateCandidates(db, s, body), updatePatient: (db, s) => patients.updatePatient(db, s, patientId, 1, body),
    billTreatment: (db, s) => completion.billTreatment(db, s, id, body), completeTreatment: (db, s) => completion.completeTreatment(db, s, id, body),
    acceptPlan: (db, s) => plans.acceptPlan(db, s, id, body), createPlan: (db, s) => plans.createPlan(db, s, body), listPlans: (db, s) => plans.listPlans(db, s), readPlan: (db, s) => plans.readPlan(db, s, id), savePlan: (db, s) => plans.savePlan(db, s, id, body),
    importStarterProcedures: (db, s) => procedures.importStarterProcedures(db, s), createProcedure: (db, s) => procedures.createProcedure(db, s, body), listProcedures: (db, s) => procedures.listProcedures(db, s, body), procedureHistory: (db, s) => procedures.procedureHistory(db, s, id), updateProcedure: (db, s) => procedures.updateProcedure(db, s, id, body),
    financeReport: (db, s) => financeReport(db, s, body),
    addClosure: (db, s) => scheduling.addClosure(db, s, body), cancelClosure: (db, s) => scheduling.cancelClosure(db, s, id, body), createScheduleResource: (db, s) => scheduling.createScheduleResource(db, s, body), getScheduleSettings: (db, s) => scheduling.getScheduleSettings(db, s), saveOpeningHours: (db, s) => scheduling.saveOpeningHours(db, s, body), updateScheduleResource: (db, s) => scheduling.updateScheduleResource(db, s, id, body),
    patientTimeline: (db, s) => patientTimeline(db, s, patientId),
    createVisit: (db, s) => visits.createVisit(db, s, body), listVisits: (db, s) => visits.listVisits(db, s, body), readVisit: (db, s) => visits.readVisit(db, s, id), saveVisitDraft: (db, s) => visits.saveVisitDraft(db, s, id, body), signVisit: (db, s) => visits.signVisit(db, s, id, body),
  };
}

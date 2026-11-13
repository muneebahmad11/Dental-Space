export const permissionCatalog = [
  'clinic.configure', 'schedule.configure', 'procedure.configure',
  'patient.clinical.write', 'patient.archive', 'patient.duplicate.override',
  'followup.read', 'followup.write',
  'plan.complete', 'plan.read', 'plan.write', 'plan.accept',
  'closing.read', 'closing.write', 'refund.post', 'billing.read', 'charge.post', 'charge.credit', 'charge.discount', 'communication.read', 'communication.send', 'communication.preferences.write', 'appointment.read', 'appointment.write', 'appointment.override', 'appointment.duration.override', 'expense.read', 'expense.write',
  'patient.demographics.read', 'patient.demographics.write', 'patient.clinical.read',
  'visit.draft.write', 'visit.finalize', 'payment.post', 'closing.approve', 'user.manage', 'audit.read',
] as const;
export type Permission = typeof permissionCatalog[number];
const all = (...except: Permission[]) => permissionCatalog.filter(p => !except.includes(p));
// Starting roles created for every new clinic. Database grants determine access; the owner adjusts them per person.
// The owner role does not author or sign clinical records: an owner who treats patients also gets the dentist role.
// Follow-up lists need patient.clinical.read, so reception does not see recalls until the owner grants it.
export const roleTemplates: Record<string, readonly Permission[]> = {
  owner: all('visit.draft.write', 'visit.finalize', 'patient.clinical.write'),
  dentist: ['patient.demographics.read', 'patient.demographics.write', 'patient.clinical.read', 'patient.clinical.write', 'visit.draft.write', 'visit.finalize', 'plan.read', 'plan.write', 'plan.accept', 'plan.complete', 'followup.read', 'followup.write', 'appointment.read', 'appointment.write', 'billing.read', 'charge.discount', 'communication.read'],
  reception: ['patient.demographics.read', 'patient.demographics.write', 'appointment.read', 'appointment.write', 'plan.read', 'billing.read', 'charge.post', 'payment.post', 'expense.read', 'expense.write', 'closing.read', 'closing.write', 'communication.read', 'communication.send', 'communication.preferences.write'],
  assistant: ['patient.demographics.read', 'patient.clinical.read', 'appointment.read', 'plan.read', 'followup.read'],
  accountant: ['patient.demographics.read', 'billing.read', 'payment.post', 'refund.post', 'expense.read', 'expense.write', 'closing.read', 'closing.write', 'closing.approve', 'audit.read'],
};

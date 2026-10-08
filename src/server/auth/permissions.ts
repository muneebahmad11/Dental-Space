export const permissionCatalog = [
  'schedule.configure',
  'patient.clinical.write', 'patient.archive', 'patient.duplicate.override',
  'followup.read', 'followup.write',
  'plan.complete', 'plan.read', 'plan.write', 'plan.accept',
  'closing.read', 'closing.write', 'refund.post', 'billing.read', 'charge.post', 'communication.read', 'communication.send', 'communication.preferences.write', 'appointment.read', 'appointment.write', 'expense.read', 'expense.write',
  'patient.demographics.read', 'patient.demographics.write', 'patient.clinical.read',
  'visit.draft.write', 'visit.finalize', 'payment.post', 'closing.approve', 'user.manage', 'audit.read',
] as const;
export type Permission = typeof permissionCatalog[number];
export const roleTemplates: Record<string, readonly Permission[]> = {
  owner: ['patient.demographics.read', 'patient.demographics.write', 'schedule.configure', 'payment.post', 'closing.approve', 'user.manage', 'audit.read'],
  dentist: ['patient.demographics.read', 'patient.demographics.write', 'patient.clinical.read', 'visit.draft.write', 'visit.finalize'],
  reception: ['patient.demographics.read', 'patient.demographics.write', 'payment.post'],
  assistant: ['patient.demographics.read'],
  accountant: ['payment.post'],
};
// Defaults are templates only. Database grants determine access; owner does not imply clinical signing.

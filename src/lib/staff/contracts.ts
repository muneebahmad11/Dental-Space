import { z } from 'zod';
import { permissionCatalog } from '../../server/auth/permissions.ts';
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const roleNames = z.array(z.string().trim().min(2).max(40)).max(10);
export const staffInviteInput = z.object({ operationId: z.uuid(), email, displayName: z.string().trim().min(2).max(120), roleNames: roleNames.min(1), branchId: z.uuid() }).strict();
export const staffUpdateInput = z.object({ operationId: z.uuid(), roleNames, grants: z.array(z.enum(permissionCatalog)).max(permissionCatalog.length), branchIds: z.array(z.uuid()).min(1).max(50), active: z.boolean() }).strict();
export const roleLabels: Record<string, string> = { owner: 'Owner', dentist: 'Dentist', reception: 'Receptionist', assistant: 'Dental assistant', accountant: 'Accountant' };
// Plain-language grouping for the permission checklist.
export const permissionGroups: { name: string; prefix: string[] }[] = [
  { name: 'Patients', prefix: ['patient.'] }, { name: 'Appointments and schedule', prefix: ['appointment.', 'schedule.'] }, { name: 'Clinical visits and plans', prefix: ['visit.', 'plan.'] },
  { name: 'Follow-ups and messages', prefix: ['followup.', 'communication.'] }, { name: 'Billing and money', prefix: ['billing.', 'charge.', 'payment.', 'refund.', 'expense.', 'closing.'] },
  { name: 'Clinic setup and staff', prefix: ['clinic.', 'procedure.', 'user.', 'audit.'] },
];

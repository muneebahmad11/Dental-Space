import { z } from 'zod';
const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine(v => !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(v));
export const closingPolicies = ['second_approver', 'owner_self_with_note'] as const;
export const closingPolicyText: Record<typeof closingPolicies[number], string> = {
  second_approver: 'A second staff member must approve each closing',
  owner_self_with_note: 'The owner may approve their own closing with a written note (solo clinics)',
};
export const clinicSettingsInput = z.object({
  expectedVersion: z.number().int().positive(), name: text(2, 120), city: text(0, 80), phone: z.string().trim().max(30).regex(/^[0-9+() -]*$/), address: text(0, 300),
  receiptHeader: text(0, 200), receiptFooter: text(0, 300), ntn: z.string().trim().max(30).regex(/^[0-9A-Za-z-]*$/), closingApprovalPolicy: z.enum(closingPolicies),
}).strict();
export const paymentMethodInput = z.object({ name: z.string().trim().min(2).max(40), active: z.boolean() }).strict();
export const methodName = z.string().trim().min(2).max(40);
export type ClinicSettings = Omit<z.infer<typeof clinicSettingsInput>, 'expectedVersion'> & { version: number };
export type PaymentMethod = { name: string; isCash: boolean; active: boolean };

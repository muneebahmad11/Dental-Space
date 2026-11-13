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
// A logo arrives as a data URL already resized in the browser. SVG is refused: it can carry scripts.
export const logoInput = z.union([
  z.object({ expectedVersion: z.number().int().positive(), dataUrl: z.string().max(300000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/) }).strict(),
  z.object({ expectedVersion: z.number().int().positive(), remove: z.literal(true) }).strict(),
]);
export const logoMaxBytes = 200 * 1024;
// Checks the file's own signature bytes, so a renamed file of another type is refused.
export function logoKind(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  const at = (i: number, ...v: number[]) => v.every((b, k) => bytes[i + k] === b);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

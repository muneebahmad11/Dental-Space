import { z } from 'zod';

const line = (min: number, max: number) => z.string().trim().min(min).max(max).refine(v => !/[\u0000-\u001f\u007f]/.test(v));
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const paidUntil = z.union([z.iso.date(), z.literal(''), z.null()]).transform(v => v || null);
const timezone = z.string().refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return v.includes('/'); } catch { return false; } });
export const ownerInput = z.object({ email, displayName: line(2, 120), alsoDentist: z.boolean().default(false) }).strict();
export const createClinicInput = z.object({
  operationId: z.uuid(), name: line(2, 120), city: line(0, 80).default(''), phone: z.string().trim().max(30).regex(/^[0-9+() -]*$/).default(''),
  timezone: timezone.default('Asia/Karachi'), branchName: line(2, 80).default('Main branch'), planNote: line(0, 500).default(''), paidUntil: paidUntil.default(null), owner: ownerInput,
}).strict();
export const updateClinicInput = z.object({ status: z.enum(['active', 'suspended']), planNote: line(0, 500), paidUntil }).strict();
export const ownerRoles = (owner: { alsoDentist: boolean }) => owner.alsoDentist ? ['dentist', 'owner'] : ['owner'];
export type InviteDelivery = 'not_sent' | 'email_sent' | 'existing_account' | 'failed';
export const deliveryText: Record<InviteDelivery, string> = {
  email_sent: 'Invite email sent',
  existing_account: 'Already has an account: ask them to sign in',
  not_sent: 'No email sent: ask them to use “Forgot password” on the sign-in page',
  failed: 'Invite email failed: resend it',
};

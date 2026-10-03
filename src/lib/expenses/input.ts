import { z } from 'zod';
export const categories = ['Supplies', 'Laboratory', 'Utilities', 'Maintenance', 'Other'] as const;
export const methods = ['Cash', 'Card', 'Bank transfer'] as const;
export const expenseDate = z.iso.date();
export const expenseInput = z.object({
  operationId: z.uuid(), paidOn: expenseDate,
  description: z.string().trim().min(1).max(240),
  category: z.enum(categories), method: z.enum(methods),
  amount: z.string().regex(/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/).transform(value => {
    const [whole, fraction = ''] = value.split('.');
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  }).refine(value => value > 0 && value <= 99999999),
}).strict();

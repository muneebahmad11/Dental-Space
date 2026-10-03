import { z } from 'zod';

export const reportRange = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
}).strict().refine(range => {
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86400000;
  return days >= 0 && days < 366;
}, { message: 'Choose an ordered range of up to 366 days.' });

export type CashFlowRow = {
  receiptsMinor: string;
  refundsMinor: string;
  expensesMinor: string;
  netReceiptsMinor: string;
  netMovementMinor: string;
};
export type FinanceReport = {
  from: string;
  to: string;
  currency: 'PKR';
  generatedAt: string;
  totals: CashFlowRow;
  days: (CashFlowRow & { businessDate: string })[];
  methods: (CashFlowRow & { method: string })[];
};

export function cashFlow(receipts: string, refunds: string, expenses: string): CashFlowRow {
  const net = BigInt(receipts) - BigInt(refunds);
  return {
    receiptsMinor: receipts, refundsMinor: refunds, expensesMinor: expenses,
    netReceiptsMinor: net.toString(),
    netMovementMinor: (net - BigInt(expenses)).toString(),
  };
}

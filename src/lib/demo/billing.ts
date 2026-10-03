export type ChargeSource = { visitId: string; itemId: string; description: string; amount: number };
export type Charge = ChargeSource & { id: string; patientId: string; date: string };
export type PaymentMethod = 'Cash' | 'Card' | 'Bank transfer';
export type Payment = {
  id: string; receiptNumber: string; patientId: string; patientName: string; date: string;
  amount: number; method: PaymentMethod; chargedAtPayment: number; paidAtPayment: number;
  balanceAfter: number; allocations: { chargeId: string; description: string; amount: number }[];
};
export type Ledger = { charges: Charge[]; payments: Payment[] };
export const emptyLedger: Ledger = { charges: [], payments: [] };
export const paymentMethods: PaymentMethod[] = ['Cash', 'Card', 'Bank transfer'];
export const demoRates: Record<string, number> = { Consultation: 150000, Cleaning: 350000, Filling: 500000, 'Root canal review': 250000, 'Orthodontic review': 200000 };
const maximumAmount = 99999999;

// Demo currency is PKR. Store all values as integer paisa, never floating-point rupees.
export function parseAmount(input: string): number | null {
  const value = input.trim();
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount > 0 && amount <= maximumAmount ? amount : null;
}
export function money(amount: number): string {
  return `PKR ${(amount / 100).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function accountTotals(ledger: Ledger, patientId: string) {
  const charged = ledger.charges.filter(c => c.patientId === patientId).reduce((n, c) => n + c.amount, 0);
  const paid = ledger.payments.filter(p => p.patientId === patientId).reduce((n, p) => n + p.amount, 0);
  return { charged, paid, balance: charged - paid };
}
export function postCharges(ledger: Ledger, patientId: string, date: string, sources: ChargeSource[]): Ledger {
  const charges = [...ledger.charges];
  for (const source of sources) {
    if (!Number.isSafeInteger(source.amount) || source.amount <= 0 || source.amount > maximumAmount) throw new Error('Enter a valid positive charge with at most two decimal places.');
    const existing = charges.find(c => c.visitId === source.visitId && c.itemId === source.itemId);
    if (existing) {
      if (existing.patientId !== patientId) throw new Error('Treatment item belongs to another account.');
      continue; // One posted charge per treatment item, even on repeated clicks.
    }
    charges.push({ ...source, id: `charge:${source.visitId}:${source.itemId}`, patientId, date });
  }
  return { ...ledger, charges };
}
export function recordPayment(ledger: Ledger, input: Pick<Payment, 'id' | 'patientId' | 'patientName' | 'date' | 'amount' | 'method'>): { ledger: Ledger; payment: Payment } {
  const existing = ledger.payments.find(p => p.id === input.id);
  if (existing) {
    if (existing.patientId !== input.patientId || existing.amount !== input.amount || existing.method !== input.method) throw new Error('This payment request was already used with different details.');
    return { ledger, payment: existing };
  }
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > maximumAmount) throw new Error('Enter a valid positive payment with at most two decimal places.');
  if (!paymentMethods.includes(input.method)) throw new Error('Choose a supported payment method.');
  const totals = accountTotals(ledger, input.patientId);
  if (input.amount > totals.balance) throw new Error('Payment exceeds the outstanding balance. Demo deposits are not enabled.');
  let remaining = input.amount;
  const allocations: Payment['allocations'] = [];
  for (const charge of ledger.charges.filter(c => c.patientId === input.patientId)) {
    const allocated = ledger.payments.flatMap(p => p.allocations).filter(a => a.chargeId === charge.id).reduce((n, a) => n + a.amount, 0);
    const amount = Math.min(remaining, charge.amount - allocated);
    if (amount > 0) { allocations.push({ chargeId: charge.id, description: charge.description, amount }); remaining -= amount; }
    if (remaining === 0) break;
  }
  if (remaining !== 0) throw new Error('Payment could not be allocated.');
  const payment: Payment = { ...input, receiptNumber: `DEMO-${String(ledger.payments.length + 1).padStart(5, '0')}`, chargedAtPayment: totals.charged, paidAtPayment: totals.paid + input.amount, balanceAfter: totals.balance - input.amount, allocations };
  return { ledger: { ...ledger, payments: [...ledger.payments, payment] }, payment };
}

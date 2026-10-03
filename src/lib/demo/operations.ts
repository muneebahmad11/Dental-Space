import { parseAmount, paymentMethods, type Ledger, type PaymentMethod } from './billing.ts';

export const expenseCategories = ['Supplies', 'Laboratory', 'Utilities', 'Maintenance', 'Other'] as const;
export type Expense = { id: string; date: string; description: string; category: typeof expenseCategories[number]; amount: number; method: PaymentMethod };
export type Closing = { date: string; opening: number; counted: number; cashCollected: number; cashExpenses: number; nonCashCollected: number; nonCashExpenses: number; expected: number; difference: number; note: string };
export type Operations = { expenses: Expense[]; closings: Closing[] };
export const emptyOperations: Operations = { expenses: [], closings: [] };
export function parseCash(input: string) { return /^0(?:\.0{1,2})?$/.test(input.trim()) ? 0 : parseAmount(input); }
export function requireOpenDay(operations: Operations, date: string) {
  if (operations.closings.some(c => c.date === date)) throw new Error('This demo day is closed. Financial entries are locked until the demo is reset.');
}
export function addExpense(operations: Operations, expense: Expense): Operations {
  const existing = operations.expenses.find(e => e.id === expense.id);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(expense)) throw new Error('Expense request already used with different details.');
    return operations;
  }
  requireOpenDay(operations, expense.date);
  if (!expense.description.trim() || expense.description.length > 160) throw new Error('Enter an expense description (up to 160 characters).');
  if (!Number.isSafeInteger(expense.amount) || expense.amount <= 0 || expense.amount > 99999999) throw new Error('Enter a valid positive expense amount.');
  if (!expenseCategories.includes(expense.category) || !paymentMethods.includes(expense.method)) throw new Error('Choose a valid category and payment method.');
  return { ...operations, expenses: [...operations.expenses, expense] };
}
export function dayTotals(ledger: Ledger, operations: Operations, date: string, opening: number) {
  const payments = ledger.payments.filter(p => p.date === date);
  const expenses = operations.expenses.filter(e => e.date === date);
  const cashCollected = payments.filter(p => p.method === 'Cash').reduce((n, p) => n + p.amount, 0);
  const cashExpenses = expenses.filter(e => e.method === 'Cash').reduce((n, e) => n + e.amount, 0);
  const nonCashCollected = payments.filter(p => p.method !== 'Cash').reduce((n, p) => n + p.amount, 0);
  const nonCashExpenses = expenses.filter(e => e.method !== 'Cash').reduce((n, e) => n + e.amount, 0);
  return { cashCollected, cashExpenses, nonCashCollected, nonCashExpenses, expected: opening + cashCollected - cashExpenses };
}
export function closeDay(operations: Operations, ledger: Ledger, input: { date: string; opening: number; counted: number; note: string }): Operations {
  requireOpenDay(operations, input.date);
  for (const amount of [input.opening, input.counted]) if (!Number.isSafeInteger(amount) || amount < 0 || amount > 99999999) throw new Error('Enter valid non-negative opening and counted cash amounts.');
  const totals = dayTotals(ledger, operations, input.date, input.opening);
  if (totals.expected < 0) throw new Error('Expected cash is negative. Review opening cash and cash expenses before closing.');
  const difference = input.counted - totals.expected;
  if (difference !== 0 && !input.note.trim()) throw new Error('Explain the cash difference before closing the demo day.');
  if (input.note.length > 500) throw new Error('Keep the closing note within 500 characters.');
  return { ...operations, closings: [...operations.closings, { ...input, note: input.note.trim(), ...totals, difference }] };
}

import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { cashFlow, reportRange, type FinanceReport } from '../../lib/reports/contracts.ts';
import { authorize, resolveContext, type Database } from '../auth/context.ts';
import { clinicPaymentMethods, clinics } from '../db/schema/organization.ts';
import { AppError } from '../http/errors.ts';
import type { PatientScope } from '../patients/service.ts';

// Paid-on dates are clinic business dates. Charges are excluded: they are not cash receipts.
export async function financeReport(db: Database, scope: PatientScope, raw: unknown): Promise<FinanceReport> {
  const range = reportRange.safeParse(raw);
  if (!range.success || !z.object({authUserId:z.uuid(),clinicId:z.uuid(),branchId:z.uuid()}).safeParse(scope).success) {
    throw new AppError(400, 'INVALID_INPUT', 'Choose an ordered date range of up to 366 days.');
  }
  return db.transaction(async tx => {
    const context = await resolveContext(tx, scope.authUserId, scope.clinicId, scope.branchId);
    authorize(context, 'billing.read');
    authorize(context, 'expense.read');
    const [clinic] = await tx.select({currency:clinics.currency,timezone:clinics.timezone}).from(clinics).where(eq(clinics.id, scope.clinicId));
    if (clinic?.currency !== 'PKR') throw new AppError(409, 'CURRENCY_UNSUPPORTED', 'Financial reports currently support PKR clinics.');
    const { from, to } = range.data;
    const rows = await tx.execute<{day:string;method:string;receipts:string;refunds:string;expenses:string}>(sql`
      select paid_on::text as day, method,
        coalesce(sum(amount) filter (where kind='receipt'),0)::text as receipts,
        coalesce(sum(amount) filter (where kind='refund'),0)::text as refunds,
        coalesce(sum(amount) filter (where kind='expense'),0)::text as expenses
      from (
        select paid_on, method, amount_minor as amount, 'receipt' as kind from clinic_app.payments
        where clinic_id=${scope.clinicId} and branch_id=${scope.branchId} and paid_on between ${from}::date and ${to}::date
        union all
        select paid_on, method, amount_minor, 'refund' from clinic_app.payment_refunds
        where clinic_id=${scope.clinicId} and branch_id=${scope.branchId} and paid_on between ${from}::date and ${to}::date
        union all
        select paid_on, method, amount_minor, 'expense' from clinic_app.expenses
        where clinic_id=${scope.clinicId} and branch_id=${scope.branchId} and paid_on between ${from}::date and ${to}::date
      ) movements group by paid_on, method order by paid_on, method
    `);
    const total = { receipts:BigInt(0), refunds:BigInt(0), expenses:BigInt(0) };
    const clinicMethods = await tx.select({name:clinicPaymentMethods.name,active:clinicPaymentMethods.active}).from(clinicPaymentMethods).where(eq(clinicPaymentMethods.clinicId, scope.clinicId)).orderBy(clinicPaymentMethods.sortOrder, clinicPaymentMethods.name);
    const methods = new Map(clinicMethods.map(method => [method.name, {...total}]));
    const days = new Map<string, typeof total>();
    for (const row of rows) {
      const day = days.get(row.day) ?? {receipts:BigInt(0),refunds:BigInt(0),expenses:BigInt(0)};
      days.set(row.day, day);
      const method = methods.get(row.method);
      if (!method) throw new AppError(500, 'REPORT_INTEGRITY', 'A payment method could not be reconciled.');
      for (const key of ['receipts','refunds','expenses'] as const) {
        const amount = BigInt(row[key]);
        total[key] += amount; day[key] += amount; method[key] += amount;
      }
    }
    const [credits] = await tx.execute<{count:number;total:string}>(sql`select count(*)::int as count, coalesce(sum(amount_minor),0)::text as total from clinic_app.credit_notes
      where clinic_id=${scope.clinicId} and branch_id=${scope.branchId} and (created_at at time zone ${clinic.timezone})::date between ${from}::date and ${to}::date`);
    // Discounts given on charges posted in the period. Like credit notes they reduce what is owed and move no money.
    const [discounts] = await tx.execute<{count:number;total:string}>(sql`select count(*)::int as count, coalesce(sum(discount_minor),0)::text as total from clinic_app.charges
      where clinic_id=${scope.clinicId} and branch_id=${scope.branchId} and discount_minor>0 and (created_at at time zone ${clinic.timezone})::date between ${from}::date and ${to}::date`);
    const present = (value:typeof total) => cashFlow(value.receipts.toString(),value.refunds.toString(),value.expenses.toString());
    return {from,to,currency:'PKR',generatedAt:new Date().toISOString(),totals:present(total),creditNotes:{count:credits.count,totalMinor:credits.total},discounts:{count:discounts.count,totalMinor:discounts.total},
      days:[...days].map(([businessDate,value])=>({businessDate,...present(value)})),
      // Disabled methods stay in the report only when the range has movement on them.
      methods:[...methods].filter(([name,value])=>clinicMethods.find(m=>m.name===name)?.active||value.receipts||value.refunds||value.expenses).map(([method,value])=>({method,...present(value)}))};
  }, {isolationLevel:'repeatable read'});
}

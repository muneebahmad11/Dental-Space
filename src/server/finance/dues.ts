import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { authorize, resolveContext, type Database } from '../auth/context.ts';
import { AppError } from '../http/errors.ts';
import type { PatientScope } from '../patients/service.ts';

export const duesQuery = z.object({ sort: z.enum(['amount', 'oldest']).default('amount'), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict();
export type DueRow = { id: string; name: string; displayId: string; phone: string; balanceMinor: string; oldestUnpaidOn: string | null; daysOutstanding: number | null; lastPaidOn: string | null };

// Patients at this branch who still owe money, with how long the oldest unpaid charge has been open.
// What is open on a charge = amount − credit notes − payments still allocated to it (refunds release allocations),
// so the per-patient sum equals the account balance shown on the patient's account.
export async function unpaidBalances(db: Database, s: PatientScope, raw: unknown) {
  const scope = z.object({ authUserId: z.uuid(), clinicId: z.uuid(), branchId: z.uuid() }).safeParse(s);
  const q = duesQuery.safeParse(raw);
  if (!scope.success || !q.success) throw new AppError(400, 'INVALID_INPUT', 'Check the list options.');
  const { sort, offset } = q.data;
  return db.transaction(async tx => {
    const c = await resolveContext(tx, s.authUserId, s.clinicId, s.branchId);
    authorize(c, 'billing.read'); authorize(c, 'patient.demographics.read');
    const accounts = sql`with open_charges as (
        select ch.patient_id, ch.created_at,
          ch.amount_minor
          - coalesce((select sum(n.amount_minor) from clinic_app.credit_notes n where n.charge_id = ch.id), 0)
          - coalesce((select sum(a.amount_minor - coalesce((select sum(r.amount_minor) from clinic_app.allocation_reversals r where r.allocation_id = a.id), 0))
                      from clinic_app.payment_allocations a where a.charge_id = ch.id), 0) as open_minor
        from clinic_app.charges ch where ch.clinic_id = ${s.clinicId} and ch.branch_id = ${s.branchId}
      ), accounts as (
        select patient_id, sum(open_minor) as balance, min(created_at) filter (where open_minor > 0) as oldest
        from open_charges group by patient_id having sum(open_minor) > 0
      )`;
    const order = sort === 'oldest' ? sql`accounts.oldest asc nulls last, accounts.balance desc` : sql`accounts.balance desc, accounts.oldest asc`;
    const rows = await tx.execute<{ id: string; name: string; display_id: string; phone: string; balance: string; oldest_on: string | null; days: number | null; last_paid: string | null }>(sql`${accounts}
      select p.id, p.name, p.display_id, p.phone, accounts.balance::text as balance,
        (accounts.oldest at time zone cl.timezone)::date::text as oldest_on,
        ((now() at time zone cl.timezone)::date - (accounts.oldest at time zone cl.timezone)::date) as days,
        (select max(pay.paid_on)::text from clinic_app.payments pay where pay.clinic_id = ${s.clinicId} and pay.branch_id = ${s.branchId} and pay.patient_id = p.id) as last_paid
      from accounts
      join clinic_app.patients p on p.id = accounts.patient_id and p.clinic_id = ${s.clinicId}
      join clinic_app.clinics cl on cl.id = ${s.clinicId}
      order by ${order}, p.id limit 50 offset ${offset}`);
    const [summary] = await tx.execute<{ patients: number; total: string }>(sql`${accounts} select count(*)::int as patients, coalesce(sum(balance), 0)::text as total from accounts`);
    const list: DueRow[] = rows.map(r => ({ id: r.id, name: r.name, displayId: r.display_id, phone: r.phone, balanceMinor: r.balance, oldestUnpaidOn: r.oldest_on, daysOutstanding: r.days === null ? null : Number(r.days), lastPaidOn: r.last_paid }));
    return { patients: list, totalPatients: summary.patients, totalMinor: summary.total, more: offset + list.length < summary.patients };
  }, { isolationLevel: 'repeatable read' });
}

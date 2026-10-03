import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { expenseDate, expenseInput } from '../../lib/expenses/input.ts';
import { authorize, resolveContext, type Database } from '../auth/context.ts';
import { expenses } from '../db/schema/expenses.ts';
import { clinics } from '../db/schema/organization.ts';
import { auditEvents } from '../db/schema/security.ts';
import { AppError } from '../http/errors.ts';
import type { PatientScope } from '../patients/service.ts';
const scopeSchema = z.object({authUserId:z.uuid(),clinicId:z.uuid(),branchId:z.uuid()});
function parse<T>(schema:z.ZodType<T>,value:unknown):T {const result=schema.safeParse(value);if(!result.success)throw new AppError(400,'INVALID_INPUT','Check the expense date, amount and details.');return result.data;}
async function context(db:Database,scope:PatientScope,write=false){parse(scopeSchema,scope);const c=await resolveContext(db,scope.authUserId,scope.clinicId,scope.branchId);authorize(c,write?'expense.write':'expense.read');return c;}
const scoped=(s:PatientScope)=>and(eq(expenses.clinicId,s.clinicId),eq(expenses.branchId,s.branchId));
export async function recordExpense(db:Database,scope:PatientScope,raw:unknown){
 const input=parse(expenseInput,raw); const {operationId,amount,...details}=input;
 const hash=createHash('sha256').update(JSON.stringify({...details,amount})).digest('hex');
 return db.transaction(async tx=>{
  const c=await context(tx,scope,true);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${scope.clinicId+':'+scope.branchId+':expense:'+operationId},0))`);
  const [existing]=await tx.select().from(expenses).where(and(scoped(scope),eq(expenses.operationId,operationId)));
  if(existing){if(existing.payloadHash!==hash)throw new AppError(409,'OPERATION_CONFLICT','This expense key has different details.');return existing;}
  const [clinic]=await tx.select({currency:clinics.currency}).from(clinics).where(eq(clinics.id,scope.clinicId));
  if(clinic?.currency!=='PKR')throw new AppError(409,'CURRENCY_UNSUPPORTED','Expense recording currently supports PKR clinics.');
  const [row]=await tx.insert(expenses).values({...details,operationId,amountMinor:amount,currency:clinic.currency,clinicId:scope.clinicId,branchId:scope.branchId,actorMembershipId:c.membershipId,payloadHash:hash}).returning();
  await tx.insert(auditEvents).values({clinicId:scope.clinicId,branchId:scope.branchId,actorMembershipId:c.membershipId,entityId:row.id,entityType:'expense',action:'expense.recorded',requestId:randomUUID()});return row;
 });
}
export async function listExpenses(db:Database,scope:PatientScope,raw:unknown){
 const query=parse(z.object({paidOn:expenseDate,offset:z.coerce.number().int().min(0).max(100000).default(0)}),raw);
 const where=and(scoped(scope),eq(expenses.paidOn,query.paidOn));
 // Rows and totals share a snapshot; totals cover every expense on the selected day.
 return db.transaction(async tx=>{
  await context(tx,scope);
  const rows=await tx.select().from(expenses).where(where).orderBy(desc(expenses.createdAt),desc(expenses.id)).limit(50).offset(query.offset);
  const [totals]=await tx.select({count:sql<number>`count(*)::integer`,totalMinor:sql<string>`coalesce(sum(${expenses.amountMinor}),0)::text`,cashMinor:sql<string>`coalesce(sum(case when ${expenses.method}='Cash' then ${expenses.amountMinor} else 0 end),0)::text`}).from(expenses).where(where);
  return {expenses:rows,...totals};
 }, {isolationLevel: 'repeatable read'});
}

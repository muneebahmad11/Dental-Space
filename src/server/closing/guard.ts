import { and,eq,sql } from 'drizzle-orm';
import type { Database } from '../auth/context.ts';
import type { PatientScope } from '../patients/service.ts';
import { closingApprovals } from '../db/schema/closing.ts';
import { AppError } from '../http/errors.ts';
export async function lockFinancialDay(db:Database,scope:PatientScope,day:string){await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${scope.clinicId+':'+scope.branchId+':financial-day:'+day},0))`);}
export async function requireOpenFinancialDay(db:Database,scope:PatientScope,day:string){await lockFinancialDay(db,scope,day);const [closed]=await db.select({id:closingApprovals.id}).from(closingApprovals).where(and(eq(closingApprovals.clinicId,scope.clinicId),eq(closingApprovals.branchId,scope.branchId),eq(closingApprovals.businessDate,day)));if(closed)throw new AppError(409,'DAY_CLOSED','This branch business day has an approved closing.');}

import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, integer, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { branches, clinicApp, memberships } from './organization.ts';
export const expenses = clinicApp.table('expenses', {
  id: uuid('id').primaryKey().defaultRandom(), clinicId: uuid('clinic_id').notNull(), branchId: uuid('branch_id').notNull(),
  actorMembershipId: uuid('actor_membership_id').notNull(), paidOn: date('paid_on').notNull(),
  description: text('description').notNull(), category: text('category').notNull(), method: text('method').notNull(),
  amountMinor: integer('amount_minor').notNull(), currency: text('currency').notNull(),
  operationId: uuid('operation_id').notNull(), payloadHash: text('payload_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [
  foreignKey({ columns: [t.clinicId,t.branchId], foreignColumns: [branches.clinicId,branches.id] }),
  foreignKey({ columns: [t.clinicId,t.actorMembershipId], foreignColumns: [memberships.clinicId,memberships.id] }),
  unique('expenses_operation_unique').on(t.clinicId,t.branchId,t.operationId),
  index('expenses_branch_date_idx').on(t.clinicId,t.branchId,t.paidOn),
  check('expenses_positive_amount',sql`${t.amountMinor} between 1 and 99999999`),
  check('expenses_description_valid',sql`length(trim(${t.description})) between 1 and 240`),
  check('expenses_category_valid',sql`${t.category} in ('Supplies','Laboratory','Utilities','Maintenance','Other')`),
  check('expenses_method_valid',sql`${t.method} in ('Cash','Card','Bank transfer')`),
  check('expenses_currency_valid',sql`${t.currency} = 'PKR'`),
]);

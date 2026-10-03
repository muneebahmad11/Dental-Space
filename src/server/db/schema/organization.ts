import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, pgSchema, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const clinicApp = pgSchema('clinic_app');
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const clinics = clinicApp.table('clinics', {
  id: uuid('id').primaryKey().defaultRandom(), name: text('name').notNull(), currency: text('currency').notNull(), timezone: text('timezone').notNull(), createdAt: createdAt(),
}, t => [check('clinics_name_nonempty', sql`length(trim(${t.name})) > 0`), check('clinics_currency_format', sql`${t.currency} ~ '^[A-Z]{3}$'`), check('clinics_timezone_nonempty', sql`length(trim(${t.timezone})) > 0`)]);
export const branches = clinicApp.table('branches', {
  id: uuid('id').primaryKey().defaultRandom(), clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'restrict' }), name: text('name').notNull(), active: boolean('active').notNull().default(true), createdAt: createdAt(),
}, t => [unique('branches_clinic_id_id_unique').on(t.clinicId, t.id), unique('branches_clinic_name_unique').on(t.clinicId, t.name), check('branches_name_nonempty', sql`length(trim(${t.name})) > 0`)]);
export const appUsers = clinicApp.table('app_users', {
  id: uuid('id').primaryKey().defaultRandom(), authUserId: uuid('auth_user_id').notNull().unique(), displayName: text('display_name').notNull(), active: boolean('active').notNull().default(true), createdAt: createdAt(),
}, t => [check('app_users_name_nonempty', sql`length(trim(${t.displayName})) > 0`)]);
export const memberships = clinicApp.table('memberships', {
  id: uuid('id').primaryKey().defaultRandom(), clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'restrict' }), userId: uuid('user_id').notNull().references(() => appUsers.id, { onDelete: 'restrict' }), active: boolean('active').notNull().default(true), createdAt: createdAt(),
}, t => [unique('memberships_clinic_user_unique').on(t.clinicId, t.userId), unique('memberships_clinic_id_id_unique').on(t.clinicId, t.id), index('memberships_user_idx').on(t.userId)]);
export const membershipBranches = clinicApp.table('membership_branches', {
  clinicId: uuid('clinic_id').notNull(), membershipId: uuid('membership_id').notNull(), branchId: uuid('branch_id').notNull(), createdAt: createdAt(),
}, t => [
  primaryKey({ columns: [t.membershipId, t.branchId] }),
  foreignKey({ name: 'membership_branches_membership_scope_fk', columns: [t.clinicId, t.membershipId], foreignColumns: [memberships.clinicId, memberships.id] }).onDelete('restrict'),
  foreignKey({ name: 'membership_branches_branch_scope_fk', columns: [t.clinicId, t.branchId], foreignColumns: [branches.clinicId, branches.id] }).onDelete('restrict'),
  index('membership_branches_branch_idx').on(t.clinicId, t.branchId),
]);

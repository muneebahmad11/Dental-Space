import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const clinicApp = pgSchema('clinic_app');
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const clinics = clinicApp.table('clinics', {
  id: uuid('id').primaryKey().defaultRandom(), name: text('name').notNull(), currency: text('currency').notNull(), timezone: text('timezone').notNull(), createdAt: createdAt(),
  // Subscription state is set only by platform operators. Suspension blocks staff access but never deletes data.
  status: text('status').notNull().default('active'), city: text('city').notNull().default(''), phone: text('phone').notNull().default(''),
  planNote: text('plan_note').notNull().default(''), paidUntil: date('paid_until'), createdOperationId: uuid('created_operation_id').unique(),
  // Owner-managed settings, printed on receipts. Closing policy: a second approver, or (solo clinics) the owner with a written note.
  address: text('address').notNull().default(''), receiptHeader: text('receipt_header').notNull().default(''), receiptFooter: text('receipt_footer').notNull().default(''), ntn: text('ntn').notNull().default(''),
  closingApprovalPolicy: text('closing_approval_policy').notNull().default('second_approver'), settingsVersion: integer('settings_version').notNull().default(1),
  // Clinic wording for WhatsApp click-to-chat messages (only the templates the clinic changed); the current logo for printouts.
  messageTemplates: jsonb('message_templates').$type<Record<string, string>>().notNull().default({}), logoId: uuid('logo_id'),
}, t => [check('clinics_closing_policy_valid', sql`${t.closingApprovalPolicy} in ('second_approver','owner_self_with_note')`), check('clinics_settings_lengths', sql`length(${t.address}) <= 300 and length(${t.receiptHeader}) <= 200 and length(${t.receiptFooter}) <= 300 and length(${t.ntn}) <= 30 and length(${t.phone}) <= 30 and length(${t.city}) <= 80 and ${t.settingsVersion} > 0`), check('clinics_name_nonempty', sql`length(trim(${t.name})) > 0`), check('clinics_status_valid', sql`${t.status} in ('active','suspended')`), check('clinics_plan_note_length', sql`length(${t.planNote}) <= 500`), check('clinics_currency_format', sql`${t.currency} ~ '^[A-Z]{3}$'`), check('clinics_timezone_nonempty', sql`length(trim(${t.timezone})) > 0`)]);
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
// Payment methods are per clinic. Names never change (payments reference them); a method is disabled, not deleted.
// The cash flag decides what the daily cash closing counts.
export const clinicPaymentMethods = clinicApp.table('clinic_payment_methods', {
  clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'restrict' }), name: text('name').notNull(), isCash: boolean('is_cash').notNull().default(false), active: boolean('active').notNull().default(true), sortOrder: integer('sort_order').notNull().default(0),
}, t => [primaryKey({ columns: [t.clinicId, t.name] }), check('clinic_payment_methods_name', sql`${t.name} = trim(${t.name}) and length(${t.name}) between 2 and 40`)]);
// Each uploaded logo is kept unchanged so receipts printed earlier still show the logo they were issued with.
// Stored as base64 PNG/JPEG/WebP (never SVG), resized in the browser before upload.
export const clinicLogos = clinicApp.table('clinic_logos', {
  id: uuid('id').primaryKey().defaultRandom(), clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'restrict' }),
  mimeType: text('mime_type').notNull(), data: text('data').notNull(), actorMembershipId: uuid('actor_membership_id').notNull(), createdAt: createdAt(),
}, t => [index('clinic_logos_clinic_idx').on(t.clinicId), check('clinic_logos_mime', sql`${t.mimeType} in ('image/png','image/jpeg','image/webp')`), check('clinic_logos_size', sql`length(${t.data}) between 100 and 300000`)]);

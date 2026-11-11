import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { branches, clinicApp, clinics, memberships } from './organization.ts';

// Platform operators run the product (create clinics, suspend/reactivate). They are not clinic members and
// have no patient, clinical or finance access: every patient service requires a clinic membership.
export const platformOperators = clinicApp.table('platform_operators', {
  id: uuid('id').primaryKey().defaultRandom(), authUserId: uuid('auth_user_id').notNull().unique(), displayName: text('display_name').notNull(), active: boolean('active').notNull().default(true), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [check('platform_operators_name_nonempty', sql`length(trim(${t.displayName})) > 0`)]);
export const operatorAuditEvents = clinicApp.table('operator_audit_events', {
  id: uuid('id').primaryKey().defaultRandom(), operatorId: uuid('operator_id').notNull().references(() => platformOperators.id, { onDelete: 'restrict' }), clinicId: uuid('clinic_id').references(() => clinics.id, { onDelete: 'restrict' }),
  action: text('action').notNull(), entityType: text('entity_type').notNull(), entityId: uuid('entity_id').notNull(), detail: jsonb('detail').notNull().default({}), occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [check('operator_audit_action_nonempty', sql`length(trim(${t.action})) > 0`), index('operator_audit_clinic_idx').on(t.clinicId, t.occurredAt)]);
// An invite binds a future sign-in (matched by verified email) to a membership with the listed role templates.
export const staffInvites = clinicApp.table('staff_invites', {
  id: uuid('id').primaryKey().defaultRandom(), clinicId: uuid('clinic_id').notNull(), branchId: uuid('branch_id').notNull(), email: text('email').notNull(), displayName: text('display_name').notNull(),
  roleNames: text('role_names').array().notNull(), status: text('status').notNull().default('pending'), delivery: text('delivery').notNull().default('not_sent'),
  invitedByOperatorId: uuid('invited_by_operator_id').references(() => platformOperators.id, { onDelete: 'restrict' }), invitedByMembershipId: uuid('invited_by_membership_id'),
  acceptedMembershipId: uuid('accepted_membership_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, t => [
  foreignKey({ name: 'staff_invites_branch_scope_fk', columns: [t.clinicId, t.branchId], foreignColumns: [branches.clinicId, branches.id] }).onDelete('restrict'),
  foreignKey({ name: 'staff_invites_inviter_scope_fk', columns: [t.clinicId, t.invitedByMembershipId], foreignColumns: [memberships.clinicId, memberships.id] }).onDelete('restrict'),
  foreignKey({ name: 'staff_invites_accepted_scope_fk', columns: [t.clinicId, t.acceptedMembershipId], foreignColumns: [memberships.clinicId, memberships.id] }).onDelete('restrict'),
  check('staff_invites_email_format', sql`${t.email} = lower(trim(${t.email})) and ${t.email} ~ '^[^@\\s]+@[^@\\s]+$' and length(${t.email}) <= 254`),
  check('staff_invites_name_nonempty', sql`length(trim(${t.displayName})) between 1 and 120`),
  check('staff_invites_status_valid', sql`${t.status} in ('pending','accepted','revoked')`),
  check('staff_invites_delivery_valid', sql`${t.delivery} in ('not_sent','email_sent','existing_account','failed')`),
  check('staff_invites_roles_nonempty', sql`cardinality(${t.roleNames}) > 0`),
  check('staff_invites_inviter_present', sql`(${t.invitedByOperatorId} is not null) <> (${t.invitedByMembershipId} is not null)`),
  uniqueIndex('staff_invites_pending_email_unique').on(t.clinicId, t.email).where(sql`${t.status} = 'pending'`),
  index('staff_invites_email_idx').on(t.email, t.status),
]);

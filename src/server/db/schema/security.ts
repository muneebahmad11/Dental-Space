import { sql } from 'drizzle-orm';
import { check, foreignKey, index, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { clinicApp, clinics, memberships, branches } from './organization.ts';

export const permissions = clinicApp.table('permissions', { key: text('key').primaryKey(), description: text('description').notNull() });
export const roles = clinicApp.table('roles', {
  id: uuid('id').primaryKey().defaultRandom(), clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'restrict' }), name: text('name').notNull(),
}, t => [unique('roles_clinic_id_unique').on(t.clinicId, t.id), unique('roles_clinic_name_unique').on(t.clinicId, t.name)]);
export const rolePermissions = clinicApp.table('role_permissions', {
  clinicId: uuid('clinic_id').notNull(), roleId: uuid('role_id').notNull(), permission: text('permission').notNull().references(() => permissions.key, { onDelete: 'restrict' }),
}, t => [primaryKey({ columns: [t.roleId, t.permission] }), foreignKey({ columns: [t.clinicId, t.roleId], foreignColumns: [roles.clinicId, roles.id] }).onDelete('restrict')]);
export const membershipRoles = clinicApp.table('membership_roles', {
  clinicId: uuid('clinic_id').notNull(), membershipId: uuid('membership_id').notNull(), roleId: uuid('role_id').notNull(),
}, t => [primaryKey({ columns: [t.membershipId, t.roleId] }), foreignKey({ columns: [t.clinicId, t.membershipId], foreignColumns: [memberships.clinicId, memberships.id] }).onDelete('restrict'), foreignKey({ columns: [t.clinicId, t.roleId], foreignColumns: [roles.clinicId, roles.id] }).onDelete('restrict')]);
export const membershipGrants = clinicApp.table('membership_grants', {
  clinicId: uuid('clinic_id').notNull(), membershipId: uuid('membership_id').notNull(), permission: text('permission').notNull().references(() => permissions.key, { onDelete: 'restrict' }),
}, t => [primaryKey({ columns: [t.membershipId, t.permission] }), foreignKey({ columns: [t.clinicId, t.membershipId], foreignColumns: [memberships.clinicId, memberships.id] }).onDelete('restrict')]);
export const auditEvents = clinicApp.table('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(), clinicId: uuid('clinic_id').notNull(), branchId: uuid('branch_id').notNull(), actorMembershipId: uuid('actor_membership_id').notNull(), action: text('action').notNull(), entityType: text('entity_type').notNull(), entityId: uuid('entity_id').notNull(), requestId: uuid('request_id').notNull(), occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  foreignKey({ columns: [t.clinicId, t.branchId], foreignColumns: [branches.clinicId, branches.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.clinicId, t.actorMembershipId], foreignColumns: [memberships.clinicId, memberships.id] }).onDelete('restrict'),
  check('audit_action_nonempty', sql`length(trim(${t.action})) > 0`), index('audit_scope_date_idx').on(t.clinicId, t.branchId, t.occurredAt),
]);

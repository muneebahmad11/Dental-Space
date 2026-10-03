import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { clinicApp, branches } from './organization.ts';
import { patients } from './patients.ts';
export const appointments = clinicApp.table('appointments', {
  id: uuid('id').primaryKey().defaultRandom(), clinicId: uuid('clinic_id').notNull(), branchId: uuid('branch_id').notNull(), patientId: uuid('patient_id').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(), endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('booked'), version: integer('version').notNull().default(1),
  operationId: uuid('operation_id').notNull(), payloadHash: text('payload_hash').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  foreignKey({ name: 'appointments_branch_scope_fk', columns: [t.clinicId,t.branchId], foreignColumns: [branches.clinicId,branches.id] }),
  foreignKey({ name: 'appointments_patient_scope_fk', columns: [t.clinicId,t.patientId], foreignColumns: [patients.clinicId,patients.id] }),
  unique('appointments_full_scope_unique').on(t.clinicId,t.branchId,t.patientId,t.id),
  unique('appointments_operation_unique').on(t.clinicId,t.branchId,t.operationId),
  index('appointments_branch_time_idx').on(t.clinicId,t.branchId,t.startsAt),
  check('appointments_time_order',sql`${t.endsAt} > ${t.startsAt} and ${t.endsAt} <= ${t.startsAt} + interval '8 hours'`),
  check('appointments_status_valid',sql`${t.status} in ('booked','arrived','cancelled')`),
  check('appointments_version_positive',sql`${t.version} > 0`),
]);

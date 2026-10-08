import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { AppointmentEventDetail } from '../../../lib/appointments/contracts.ts';
import { clinicApp, branches, memberships } from './organization.ts';
import { patients } from './patients.ts';
import { procedures } from './procedures.ts';
import { scheduleChairs, scheduleDentists } from './scheduling.ts';
export const appointments = clinicApp.table('appointments', {
  id: uuid('id').primaryKey().defaultRandom(), clinicId: uuid('clinic_id').notNull(), branchId: uuid('branch_id').notNull(), patientId: uuid('patient_id').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(), endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('booked'), version: integer('version').notNull().default(1),
  dentistId: uuid('dentist_id'), chairId: uuid('chair_id'), procedureId: uuid('procedure_id'),
  reason: text('reason').notNull().default(''), notes: text('notes').notNull().default(''), nextAction: text('next_action').notNull().default(''),
  source: text('source').notNull().default('phone'), overrideReason: text('override_reason'),
  operationId: uuid('operation_id').notNull(), payloadHash: text('payload_hash').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  foreignKey({ name: 'appointments_branch_scope_fk', columns: [t.clinicId,t.branchId], foreignColumns: [branches.clinicId,branches.id] }),
  foreignKey({ name: 'appointments_patient_scope_fk', columns: [t.clinicId,t.patientId], foreignColumns: [patients.clinicId,patients.id] }),
  foreignKey({ name: 'appointments_dentist_scope_fk', columns: [t.clinicId,t.branchId,t.dentistId], foreignColumns: [scheduleDentists.clinicId,scheduleDentists.branchId,scheduleDentists.id] }),
  foreignKey({ name: 'appointments_chair_scope_fk', columns: [t.clinicId,t.branchId,t.chairId], foreignColumns: [scheduleChairs.clinicId,scheduleChairs.branchId,scheduleChairs.id] }),
  foreignKey({ name: 'appointments_procedure_scope_fk', columns: [t.clinicId,t.procedureId], foreignColumns: [procedures.clinicId,procedures.id] }),
  unique('appointments_full_scope_unique').on(t.clinicId,t.branchId,t.patientId,t.id),
  unique('appointments_scope_unique').on(t.clinicId,t.branchId,t.id),
  unique('appointments_operation_unique').on(t.clinicId,t.branchId,t.operationId),
  index('appointments_branch_time_idx').on(t.clinicId,t.branchId,t.startsAt),
  index('appointments_dentist_time_idx').on(t.clinicId,t.branchId,t.dentistId,t.startsAt),
  check('appointments_time_order',sql`${t.endsAt} > ${t.startsAt} and ${t.endsAt} <= ${t.startsAt} + interval '8 hours'`),
  check('appointments_status_valid',sql`${t.status} in ('booked','confirmed','arrived','waiting','in_treatment','completed','cancelled','no_show')`),
  check('appointments_source_valid',sql`${t.source} in ('phone','in_person','walk_in','follow_up','online','other')`),
  check('appointments_text_lengths',sql`length(${t.reason}) <= 240 and length(${t.notes}) <= 1000 and length(${t.nextAction}) <= 240 and (${t.overrideReason} is null or length(trim(${t.overrideReason})) between 3 and 300)`),
  check('appointments_version_positive',sql`${t.version} > 0`),
]);
// Immutable lifecycle history: one row per appointment version; also the idempotency record for later commands.
export const appointmentEvents = clinicApp.table('appointment_events', {
  id: uuid('id').primaryKey().defaultRandom(), clinicId: uuid('clinic_id').notNull(), branchId: uuid('branch_id').notNull(), appointmentId: uuid('appointment_id').notNull(),
  version: integer('version').notNull(), kind: text('kind').notNull(), fromStatus: text('from_status'), toStatus: text('to_status').notNull(),
  detail: jsonb('detail').$type<AppointmentEventDetail>().notNull(), actorMembershipId: uuid('actor_membership_id').notNull(),
  operationId: uuid('operation_id').notNull(), payloadHash: text('payload_hash').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique('appointment_event_version_unique').on(t.appointmentId,t.version),
  unique('appointment_event_operation_unique').on(t.clinicId,t.branchId,t.operationId),
  foreignKey({ name: 'appointment_event_parent_fk', columns: [t.clinicId,t.branchId,t.appointmentId], foreignColumns: [appointments.clinicId,appointments.branchId,appointments.id] }),
  foreignKey({ name: 'appointment_event_actor_fk', columns: [t.clinicId,t.actorMembershipId], foreignColumns: [memberships.clinicId,memberships.id] }),
  check('appointment_event_kind',sql`${t.kind} in ('booked','walk_in','status','rescheduled','details')`),
  check('appointment_event_version',sql`${t.version} > 0`),
  index('appointment_event_parent_idx').on(t.clinicId,t.branchId,t.appointmentId,t.version),
]);

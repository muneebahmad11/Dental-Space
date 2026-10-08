import { sql } from 'drizzle-orm';
import { check,foreignKey,integer,jsonb,primaryKey,text,timestamp,unique,uuid } from 'drizzle-orm/pg-core';
import type { ContactPreferenceBody } from '../../../lib/contact-preferences/contracts.ts';
import { branches,clinicApp,memberships } from './organization.ts';
import { patients } from './patients.ts';
// Clinic-wide current projection of how a patient may be contacted; history lives in the immutable versions table.
export const contactPreferences=clinicApp.table('patient_contact_preferences',{
 clinicId:uuid('clinic_id').notNull(),patientId:uuid('patient_id').notNull(),body:jsonb('body').$type<ContactPreferenceBody>().notNull(),version:integer('version').notNull(),updatedAt:timestamp('updated_at',{withTimezone:true}).defaultNow().notNull(),
},t=>[primaryKey({columns:[t.clinicId,t.patientId]}),foreignKey({name:'contact_preference_patient_fk',columns:[t.clinicId,t.patientId],foreignColumns:[patients.clinicId,patients.id]}),check('contact_preference_version',sql`${t.version}>0`)]);
export const contactPreferenceVersions=clinicApp.table('patient_contact_preference_versions',{
 id:uuid('id').primaryKey().defaultRandom(),clinicId:uuid('clinic_id').notNull(),branchId:uuid('branch_id').notNull(),patientId:uuid('patient_id').notNull(),version:integer('version').notNull(),body:jsonb('body').$type<ContactPreferenceBody>().notNull(),reason:text('reason').notNull(),actorMembershipId:uuid('actor_membership_id').notNull(),operationId:uuid('operation_id').notNull(),payloadHash:text('payload_hash').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
},t=>[unique('contact_preference_version_unique').on(t.clinicId,t.patientId,t.version),unique('contact_preference_operation_unique').on(t.clinicId,t.operationId),foreignKey({name:'contact_preference_version_patient_fk',columns:[t.clinicId,t.patientId],foreignColumns:[patients.clinicId,patients.id]}),foreignKey({name:'contact_preference_version_branch_fk',columns:[t.clinicId,t.branchId],foreignColumns:[branches.clinicId,branches.id]}),foreignKey({name:'contact_preference_version_actor_fk',columns:[t.clinicId,t.actorMembershipId],foreignColumns:[memberships.clinicId,memberships.id]}),check('contact_preference_reason',sql`length(trim(${t.reason})) between 3 and 300`),check('contact_preference_version_positive',sql`${t.version}>0`)]);

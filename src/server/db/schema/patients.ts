import { sql } from 'drizzle-orm';
import { check, index, integer, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { clinicApp, clinics } from './organization.ts';
export const patients = clinicApp.table('patients', {
  creationKey: uuid('creation_key').notNull(), creationHash: text('creation_hash').notNull(),
  id: uuid('id').primaryKey().defaultRandom(), clinicId: uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'restrict' }), displayId: text('display_id').notNull(), name: text('name').notNull(), phone: text('phone').notNull(), phoneNormalized: text('phone_normalized').notNull(), email: text('email'), version: integer('version').notNull().default(1), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('patients_clinic_creation_key_unique').on(t.clinicId, t.creationKey), unique('patients_clinic_display_unique').on(t.clinicId, t.displayId), unique('patients_clinic_id_unique').on(t.clinicId, t.id), index('patients_clinic_phone_idx').on(t.clinicId, t.phoneNormalized), check('patients_name_nonempty', sql`length(trim(${t.name})) >= 2`), check('patients_version_positive', sql`${t.version} > 0`)]);

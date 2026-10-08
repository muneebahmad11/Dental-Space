import { foreignKey,index,primaryKey,timestamp,uuid } from 'drizzle-orm/pg-core';
import { clinicApp,memberships } from './organization.ts';
import { patients } from './patients.ts';
// Per-staff navigation convenience only; not clinical history and not an access audit.
export const recentPatients=clinicApp.table('recent_patients',{
 clinicId:uuid('clinic_id').notNull(),membershipId:uuid('membership_id').notNull(),patientId:uuid('patient_id').notNull(),viewedAt:timestamp('viewed_at',{withTimezone:true}).defaultNow().notNull(),
},t=>[primaryKey({columns:[t.membershipId,t.patientId]}),foreignKey({name:'recent_patient_member_fk',columns:[t.clinicId,t.membershipId],foreignColumns:[memberships.clinicId,memberships.id]}),foreignKey({name:'recent_patient_patient_fk',columns:[t.clinicId,t.patientId],foreignColumns:[patients.clinicId,patients.id]}),index('recent_patient_member_idx').on(t.membershipId,t.viewedAt)]);

import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { authorize, resolveContext, type Database } from '../auth/context.ts';
import { patients } from '../db/schema/patients.ts';
import { auditEvents } from '../db/schema/security.ts';
import { AppError } from '../http/errors.ts';

const scopeSchema = z.object({ authUserId: z.uuid(), clinicId: z.uuid(), branchId: z.uuid() });
export type PatientScope = z.infer<typeof scopeSchema>;
export const patientInput = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(7).max(30).regex(/^[+\d\s()-]+$/).refine(v => v.replace(/\D/g, '').length >= 7),
  email: z.union([z.email().max(254), z.literal('')]).optional(),
}).strict();
const patientFields = { id: patients.id, displayId: patients.displayId, name: patients.name, phone: patients.phone, email: patients.email, version: patients.version, createdAt: patients.createdAt };
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError(400, 'INVALID_INPUT', 'Check the supplied patient details.');
  return result.data;
}
async function context(db: Database, raw: PatientScope, write = false) {
  const scope = parse(scopeSchema, raw);
  const verified = await resolveContext(db, scope.authUserId, scope.clinicId, scope.branchId);
  authorize(verified, write ? 'patient.demographics.write' : 'patient.demographics.read');
  return verified;
}
export async function listPatients(db: Database, scope: PatientScope, raw: unknown = {}) {
  const input = parse(z.object({ search: z.string().trim().max(100).default(''), offset: z.number().int().min(0).max(100000).default(0) }).strict(), raw);
  const ctx = await context(db, scope);
  const search = `%${input.search.replace(/[\\%_]/g, '\\$&')}%`;
  const digits=input.search.replace(/\D/g,'');
  return db.select({...patientFields,status:sql<string>`coalesce((select pr.body->>'status' from clinic_app.patient_profiles pr where pr.patient_id=${patients.id} and pr.clinic_id=${patients.clinicId}),'active')`}).from(patients).where(and(eq(patients.clinicId, ctx.clinicId), input.search ? or(ilike(patients.name, search), ilike(patients.phone, search), ilike(patients.displayId, search),digits.length>=3?ilike(patients.phoneNormalized,`%${digits}%`):undefined,digits.length>=3?sql`exists(select 1 from clinic_app.patient_profiles pr where pr.patient_id=${patients.id} and pr.clinic_id=${patients.clinicId} and regexp_replace(pr.body->>'alternatePhone','[^0-9]','','g') like ${`%${digits}%`})`:undefined) : undefined)).orderBy(desc(patients.createdAt), desc(patients.id)).limit(50).offset(input.offset);
}
export async function createPatient(db: Database, scope: PatientScope, raw: unknown) {
  const { operationId, ...input } = parse(patientInput.extend({ operationId: z.uuid() }), raw);
  const creationHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return db.transaction(async tx => {
    const ctx = await context(tx, scope, true);
    const id = randomUUID();
    const [patient] = await tx.insert(patients).values({ id, creationKey: operationId, creationHash, clinicId: ctx.clinicId, displayId: `P-${id}`, ...input, email: input.email || null, phoneNormalized: input.phone.replace(/\D/g, '') }).onConflictDoNothing({ target: [patients.clinicId, patients.creationKey] }).returning(patientFields);
    if (!patient) {
      const [existing] = await tx.select({ ...patientFields, creationHash: patients.creationHash }).from(patients).where(and(eq(patients.clinicId, ctx.clinicId), eq(patients.creationKey, operationId))).limit(1);
      if (!existing || existing.creationHash !== creationHash) throw new AppError(409, 'OPERATION_CONFLICT', 'This registration request key was already used with different details.');
      const { creationHash: storedHash, ...result } = existing;
      void storedHash;
      return result;
    }
    await tx.insert(auditEvents).values({ clinicId: ctx.clinicId, branchId: ctx.branchId, actorMembershipId: ctx.membershipId, action: 'patient.created', entityType: 'patient', entityId: id, requestId: randomUUID() });
    return patient;
  });
}
export async function updatePatient(db: Database, scope: PatientScope, patientId: string, expectedVersion: number, raw: unknown) {
  const input = parse(patientInput, raw);
  parse(z.uuid(), patientId); parse(z.number().int().positive(), expectedVersion);
  return db.transaction(async tx => {
    const ctx = await context(tx, scope, true);
    const [patient] = await tx.update(patients).set({ ...input, email: input.email || null, phoneNormalized: input.phone.replace(/\D/g, ''), version: sql`${patients.version} + 1` }).where(and(eq(patients.id, patientId), eq(patients.clinicId, ctx.clinicId), eq(patients.version, expectedVersion))).returning(patientFields);
    if (!patient) throw new AppError(409, 'PATIENT_CONFLICT', 'Patient unavailable or changed. Refresh before trying again.');
    await tx.insert(auditEvents).values({ clinicId: ctx.clinicId, branchId: ctx.branchId, actorMembershipId: ctx.membershipId, action: 'patient.updated', entityType: 'patient', entityId: patientId, requestId: randomUUID() });
    return patient;
  });
}

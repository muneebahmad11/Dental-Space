import './load-env.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { migrationEnvironment, requireLocalDatabase, connectionOptions } from '../src/lib/config/environment.ts';
import { assertStaffAccess, resolveContext, type Database } from '../src/server/auth/context.ts';
import { roleTemplates } from '../src/server/auth/permissions.ts';
import { AppError } from '../src/server/http/errors.ts';
import { acceptInvites, createClinic, inviteOwner, listClinics, operatorAudit, updateClinic } from '../src/server/operator/service.ts';
import { createPatient, listPatients } from '../src/server/patients/service.ts';
import type { PatientScope } from '../src/server/patients/service.ts';
import { staffRouteCalls, type StaffCall } from './staff-route-calls.ts';

const { MIGRATION_DATABASE_URL: url } = migrationEnvironment(process.env); requireLocalDatabase(url);
const client = postgres(url, { ...connectionOptions(url), max: 1 }); const rollback = new Error('ROLLBACK_FIXTURES');
const status = (n: number) => (e: unknown) => e instanceof AppError && e.status === n;
// Runs every staff route call as a caller who must be refused and reports each one that was not refused that way.
async function refusals(tx: Database, calls: Record<string, StaffCall>, scope: PatientScope, expected: string) {
  const wrong: string[] = []; let exact = 0;
  for (const [name, call] of Object.entries(calls)) {
    try { await tx.transaction(n => call(n as Database, scope)); wrong.push(`${name}: allowed`); }
    catch (e) { if (!(e instanceof AppError && (e.code === expected || e.status === 400))) wrong.push(`${name}: ${e instanceof AppError ? e.code : 'error'}`); else if (e.code === expected) exact++; }
  }
  // Services that validate input first answer 400 without reading anything; the rest must give the exact refusal.
  assert.ok(exact >= 25, `only ${exact} services reached the access check`);
  return wrong;
}
const denied = (e: unknown) => (e as { cause?: { code?: string }; code?: string }).cause?.code === '42501' || (e as { code?: string }).code === '42501';

// Every service function a staff API route imports must be in the call table, so a new route cannot skip these checks.
function importedByRoutes(dir = 'src/app/api/v1'): Set<string> {
  const names = new Set<string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (!['operator', 'webhooks', 'session'].includes(entry.name)) for (const n of importedByRoutes(path)) names.add(n); continue; }
    for (const match of readFileSync(path, 'utf8').matchAll(/import\s*\{([^}]+)\}\s*from\s*'@\/server\/(?!auth\/|db\/|http\/|messaging\/(?:config|provider|webhook)')[^']+'/g))
      for (const name of match[1].split(',').map(n => n.trim()).filter(Boolean)) if (!name.startsWith('type ')) names.add(name);
  }
  return names;
}
function ungatedRoutes(dir = 'src/app/api/v1'): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (!['operator', 'webhooks', 'session'].includes(entry.name)) found.push(...ungatedRoutes(path)); continue; }
    const source = readFileSync(path, 'utf8');
    if ((source.match(/export async function/g) ?? []).length !== (source.match(/patientScope\(request\)/g) ?? []).length) found.push(path);
  }
  return found;
}
try { try { await drizzle(client).transaction(async tx => {
  await tx.execute(sql`select pg_advisory_xact_lock(73492026)`);
  const operatorAuth = randomUUID(); const strangerAuth = randomUUID(); const ownerAuth = randomUUID(); const replacedAuth = randomUUID();
  await tx.execute(sql`insert into clinic_app.platform_operators(auth_user_id,display_name) values (${operatorAuth},'Synthetic operator')`);
  await tx.execute(sql`set local role clinic_runtime`);
  const sent: string[] = []; const send = async (email: string) => { sent.push(email); return 'email_sent' as const; };
  const input = { operationId: randomUUID(), name: 'Synthetic Smiles', city: 'Lahore', phone: '+92 300 0000000', timezone: 'Asia/Karachi', branchName: 'Main branch', planNote: 'Standard', paidUntil: '2026-12-31', owner: { email: 'Owner@Synthetic.Example', displayName: 'Synthetic Owner', alsoDentist: true } };

  // Only an active operator can create a clinic; the runtime role cannot write organization tables itself.
  await assert.rejects(createClinic(tx, strangerAuth, input, send), status(403));
  await assert.rejects(tx.transaction(async n => { await n.execute(sql`insert into clinic_app.clinics(name,currency,timezone) values ('Forbidden','PKR','Asia/Karachi')`); }), denied);
  await assert.rejects(tx.transaction(async n => { await n.execute(sql`update clinic_app.clinics set status='active'`); }), denied);
  await assert.rejects(tx.transaction(async n => { await n.execute(sql`insert into clinic_app.platform_operators(auth_user_id,display_name) values (${strangerAuth},'Self grant')`); }), denied);
  await assert.rejects(tx.transaction(async n => { await n.execute(sql`select clinic_app.require_operator(${operatorAuth}::uuid)`); }), denied);
  for (const bad of [{ ...input, name: ' ' }, { ...input, timezone: 'Mars/Base' }, { ...input, owner: { ...input.owner, email: 'not-an-email' } }, { ...input, currency: 'USD' }]) await assert.rejects(createClinic(tx, operatorAuth, bad, send), status(400));
  const created = await createClinic(tx, operatorAuth, input, send);
  assert.equal(created.replayed, false); assert.equal(created.delivery, 'email_sent'); assert.deepEqual(sent, ['owner@synthetic.example']);
  const replay = await createClinic(tx, operatorAuth, input, send);
  assert.equal(replay.clinicId, created.clinicId); assert.equal(replay.replayed, true); assert.equal(sent.length, 1);
  await assert.rejects(createClinic(tx, operatorAuth, { ...input, name: 'Changed name' }, send), status(409));
  const clinicId = created.clinicId; const branchId = created.branchId;
  let [listed] = (await listClinics(tx, operatorAuth)).clinics.filter(c => c.id === clinicId);
  assert.deepEqual([listed.status, listed.paidUntil, listed.ownerEmail, listed.inviteStatus, listed.inviteDelivery, listed.staffCount], ['active', '2026-12-31', 'owner@synthetic.example', 'pending', 'email_sent', 0]);
  await assert.rejects(listClinics(tx, strangerAuth), status(403));

  // Replacing the owner invite revokes the earlier one; an unverified email never binds an invite.
  await inviteOwner(tx, operatorAuth, clinicId, { email: 'replaced@synthetic.example', displayName: 'Replaced Owner', alsoDentist: false }, send);
  await inviteOwner(tx, operatorAuth, clinicId, input.owner, send);
  assert.equal(await acceptInvites(tx, replacedAuth, 'replaced@synthetic.example', async () => true), 0);
  assert.equal(await acceptInvites(tx, ownerAuth, 'owner@synthetic.example', async () => false), 0);
  assert.equal(await acceptInvites(tx, ownerAuth, null, async () => true), 0);
  await assert.rejects(resolveContext(tx, ownerAuth, clinicId, branchId), status(403));
  assert.equal(await acceptInvites(tx, ownerAuth, ' Owner@Synthetic.Example ', async () => true), 1);
  assert.equal(await acceptInvites(tx, ownerAuth, 'owner@synthetic.example', async () => true), 0);
  const context = await resolveContext(tx, ownerAuth, clinicId, branchId);
  assert.deepEqual([...context.permissions].sort(), [...new Set([...roleTemplates.owner, ...roleTemplates.dentist])].sort());
  [listed] = (await listClinics(tx, operatorAuth)).clinics.filter(c => c.id === clinicId);
  assert.deepEqual([listed.inviteStatus, listed.staffCount], ['accepted', 1]);
  await assert.rejects(inviteOwner(tx, operatorAuth, randomUUID(), input.owner, send), status(404));

  const scope = { authUserId: ownerAuth, clinicId, branchId };
  const patient = await createPatient(tx, scope, { operationId: randomUUID(), name: 'Synthetic Patient', phone: '+92 300 0000000', email: '' });
  const calls = staffRouteCalls(patient.id);
  const missing = [...importedByRoutes()].filter(name => !(name in calls) && name !== 'patientInput');
  assert.deepEqual(missing, [], `Add these route service functions to scripts/staff-route-calls.ts: ${missing.join(', ')}`);

  // Every staff route handler starts with patientScope, which runs assertStaffAccess before reading any input.
  assert.deepEqual(ungatedRoutes(), []);
  await assertStaffAccess(tx, ownerAuth, clinicId, branchId);
  await assert.rejects(assertStaffAccess(tx, operatorAuth, clinicId, branchId), status(403));
  await assert.rejects(assertStaffAccess(tx, ownerAuth, clinicId, randomUUID()), status(403));
  // The operator has no clinic membership: every staff route's service refuses them, including for a clinic they created.
  assert.deepEqual(await refusals(tx as Database, calls, { ...scope, authUserId: operatorAuth }, 'FORBIDDEN'), []);

  // Suspension blocks every staff route for the clinic's own staff, keeps the data, and is reversible.
  await assert.rejects(updateClinic(tx, strangerAuth, clinicId, { status: 'suspended', planNote: '', paidUntil: null }), status(403));
  await assert.rejects(updateClinic(tx, operatorAuth, clinicId, { status: 'deleted', planNote: '', paidUntil: null }), status(400));
  await assert.rejects(updateClinic(tx, operatorAuth, randomUUID(), { status: 'suspended', planNote: '', paidUntil: null }), status(404));
  assert.equal((await updateClinic(tx, operatorAuth, clinicId, { status: 'suspended', planNote: 'Unpaid since November', paidUntil: '2026-10-31' })).status, 'suspended');
  assert.deepEqual(await refusals(tx as Database, calls, scope, 'SUBSCRIPTION_INACTIVE'), []);
  await assert.rejects(assertStaffAccess(tx, ownerAuth, clinicId, branchId), (e: unknown) => e instanceof AppError && e.code === 'SUBSCRIPTION_INACTIVE');
  assert.equal((await tx.execute<{ count: number }>(sql`select count(*)::int as count from clinic_app.patients where clinic_id=${clinicId}`))[0].count, 1);
  await updateClinic(tx, operatorAuth, clinicId, { status: 'active', planNote: 'Paid', paidUntil: '2027-01-31' });
  assert.equal((await listPatients(tx, scope)).length, 1);

  // Every operator action is in the append-only operator audit; a deactivated operator loses access at once.
  const actions = (await operatorAudit(tx, operatorAuth, clinicId)).map(e => e.action);
  for (const action of ['operator.clinic.created', 'operator.owner.invited', 'operator.owner.invite_delivery', 'operator.clinic.suspended', 'operator.clinic.reactivated']) assert.ok(actions.includes(action), action);
  await tx.execute(sql`reset role`);
  for (const query of [sql`update clinic_app.operator_audit_events set action='x' where clinic_id=${clinicId}`, sql`delete from clinic_app.operator_audit_events where clinic_id=${clinicId}`, sql`truncate clinic_app.operator_audit_events`]) await assert.rejects(tx.transaction(async n => { await n.execute(query); }));
  const [audit] = await tx.execute<{ count: number }>(sql`select count(*)::int as count from clinic_app.audit_events where clinic_id=${clinicId} and action='staff.invite.accepted'`); assert.equal(audit.count, 1);
  await tx.execute(sql`update clinic_app.platform_operators set active=false where auth_user_id=${operatorAuth}`);
  await tx.execute(sql`set local role clinic_runtime`);
  await assert.rejects(listClinics(tx, operatorAuth), status(403));
  await assert.rejects(updateClinic(tx, operatorAuth, clinicId, { status: 'suspended', planNote: '', paidUntil: null }), status(403));
  throw rollback;
}); } catch (e) { if (e !== rollback) throw e; } console.log('Operator console integration passed: operator-only clinic creation with retries, owner invite binding by verified email, role templates, suspension blocking every staff route with data kept, operator denied every staff route, append-only operator audit. Fixtures rolled back.'); }
catch (e) { console.error('Operator console integration failed.', e instanceof assert.AssertionError ? e.message : e instanceof AppError ? e.code : e); process.exitCode = 1; } finally { await client.end(); }

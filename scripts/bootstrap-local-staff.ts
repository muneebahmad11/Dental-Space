import './load-env.ts';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { z } from 'zod';
import { migrationEnvironment, requireLocalDatabase, connectionOptions } from '../src/lib/config/environment.ts';

// Verify the supplied UUID in the configured Supabase project's Users screen first.
// Execution requires explicit approval of the three grants below.
async function main() {
  const authUserId = z.uuid().parse(process.argv[2]);
  const { MIGRATION_DATABASE_URL: url } = migrationEnvironment(process.env);
  requireLocalDatabase(url);
  const db = postgres(url, { ...connectionOptions(url), max: 1 });
  try {
    await db.begin(async tx => {
      await tx`select pg_advisory_xact_lock(73492002)`;
      const existing = await tx`select id from clinic_app.app_users where auth_user_id = ${authUserId}`;
      if (existing.length) { console.log('Account already provisioned; permissions preserved.'); return; }
      const [count] = await tx`select count(*)::int as count from clinic_app.clinics`;
      if (count.count !== 0) throw new Error('NOT_EMPTY');
      const [clinic] = await tx`insert into clinic_app.clinics(name,currency,timezone) values ('Development Dental Clinic','PKR','Asia/Karachi') returning id`;
      const [branch] = await tx`insert into clinic_app.branches(clinic_id,name) values (${clinic.id},'Development branch') returning id`;
      const [user] = await tx`insert into clinic_app.app_users(auth_user_id,display_name) values (${authUserId},'Development administrator') returning id`;
      const [membership] = await tx`insert into clinic_app.memberships(clinic_id,user_id) values (${clinic.id},${user.id}) returning id`;
      await tx`insert into clinic_app.membership_branches(clinic_id,membership_id,branch_id) values (${clinic.id},${membership.id},${branch.id})`;
      for (const permission of ['patient.demographics.read','patient.demographics.write','audit.read']) {
        await tx`insert into clinic_app.membership_grants(clinic_id,membership_id,permission) values (${clinic.id},${membership.id},${permission})`;
      }
      await tx`insert into clinic_app.audit_events(clinic_id,branch_id,actor_membership_id,action,entity_type,entity_id,request_id) values (${clinic.id},${branch.id},${membership.id},'development.staff.bootstrapped','membership',${membership.id},${randomUUID()})`;
      console.log('Development staff provisioned with demographic read/write and audit read; bootstrap audited.');
    });
  } finally { await db.end(); }
}
main().catch(() => { console.error('Bootstrap failed: check UUID, local database and empty-clinic requirement. No credentials logged.'); process.exitCode = 1; });

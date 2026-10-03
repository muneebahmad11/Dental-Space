import './load-env.ts';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { migrationEnvironment, runtimeEnvironment, requireLocalDatabase, connectionOptions } from '../src/lib/config/environment.ts';
async function main() {
  const { MIGRATION_DATABASE_URL } = migrationEnvironment(process.env);
  const { DATABASE_URL } = runtimeEnvironment(process.env);
  requireLocalDatabase(MIGRATION_DATABASE_URL); requireLocalDatabase(DATABASE_URL);
  const migrationTarget = new URL(MIGRATION_DATABASE_URL); const runtimeTarget = new URL(DATABASE_URL);
  assert.equal(migrationTarget.host, runtimeTarget.host); assert.equal(migrationTarget.pathname, runtimeTarget.pathname);
  const admin = postgres(MIGRATION_DATABASE_URL, { ...connectionOptions(MIGRATION_DATABASE_URL), max: 1 });
  const runtime = postgres(DATABASE_URL, { ...connectionOptions(DATABASE_URL), max: 1 });
  const rollback = new Error('ROLLBACK_VERIFICATION_FIXTURES');
  try {
    const [role] = await runtime`select current_user as name, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname = current_user`;
    assert.equal(role.name, 'clinic_runtime');
    for (const flag of ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolbypassrls']) assert.equal(role[flag], false);
    await runtime`select id from clinic_app.clinics limit 1`;
    try {
      await runtime.begin(async tx => {
        await assert.rejects(tx.savepoint(async nested => { await nested`insert into clinic_app.clinics(name,currency,timezone) values ('Forbidden fixture','PKR','Asia/Karachi')`; }), (e: unknown) => (e as { code?: string }).code === '42501');
        await assert.rejects(tx.savepoint(async nested => { await nested`create table clinic_app.forbidden_fixture(id int)`; }), (e: unknown) => (e as { code?: string }).code === '42501');
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    try {
      await admin.begin(async tx => {
        const [first] = await tx`insert into clinic_app.clinics(name,currency,timezone) values ('Verification clinic A','PKR','Asia/Karachi') returning id`;
        const [second] = await tx`insert into clinic_app.clinics(name,currency,timezone) values ('Verification clinic B','PKR','Asia/Karachi') returning id`;
        const [branchA] = await tx`insert into clinic_app.branches(clinic_id,name) values (${first.id},'Branch A') returning id`;
        const [branchB] = await tx`insert into clinic_app.branches(clinic_id,name) values (${second.id},'Branch B') returning id`;
        const [user] = await tx`insert into clinic_app.app_users(auth_user_id,display_name) values (gen_random_uuid(),'Synthetic verification user') returning id`;
        const [member] = await tx`insert into clinic_app.memberships(clinic_id,user_id) values (${first.id},${user.id}) returning id`;
        await tx`insert into clinic_app.membership_branches(clinic_id,membership_id,branch_id) values (${first.id},${member.id},${branchA.id})`;
        await assert.rejects(tx.savepoint(async nested => { await nested`insert into clinic_app.membership_branches(clinic_id,membership_id,branch_id) values (${first.id},${member.id},${branchB.id})`; }), (e: unknown) => (e as { code?: string }).code === '23503');
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    console.log('Local PostgreSQL checks passed: restricted runtime, denied writes/DDL, valid membership and cross-clinic FK rejection. Fixtures rolled back.');
  } finally { await Promise.all([admin.end(), runtime.end()]); }
}
main().catch(() => { console.error('Database verification failed. Check local configuration, migrations and runtime setup. No credentials or database rows are logged.'); process.exitCode = 1; });

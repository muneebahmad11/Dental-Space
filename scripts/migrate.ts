import './load-env.ts';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { migrationEnvironment, requireLocalUnlessRemoteFlag, connectionOptions } from '../src/lib/config/environment.ts';
async function main() {
  const { MIGRATION_DATABASE_URL } = migrationEnvironment(process.env);
  requireLocalUnlessRemoteFlag(MIGRATION_DATABASE_URL, process.argv);
  const sql = postgres(MIGRATION_DATABASE_URL, { ...connectionOptions(MIGRATION_DATABASE_URL), max: 1 });
  try {
    await sql`select pg_advisory_lock(73492001)`;
    try { await migrate(drizzle(sql), { migrationsFolder: './drizzle' }); }
    finally { await sql`select pg_advisory_unlock(73492001)`; }
    console.log('Migrations applied. No demo records were imported.');
  } finally { await sql.end(); }
}
main().catch(() => { console.error('Migration failed. Check local database availability, credentials and reviewed SQL. Connection details are not logged.'); process.exitCode = 1; });

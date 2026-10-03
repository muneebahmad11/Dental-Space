import './load-env.ts';
import postgres from 'postgres';
import { migrationEnvironment, runtimeEnvironment, requireLocalDatabase, connectionOptions } from '../src/lib/config/environment.ts';
async function main() {
  const { MIGRATION_DATABASE_URL } = migrationEnvironment(process.env);
  const { DATABASE_URL } = runtimeEnvironment(process.env);
  requireLocalDatabase(MIGRATION_DATABASE_URL); requireLocalDatabase(DATABASE_URL);
  const admin = new URL(MIGRATION_DATABASE_URL); const runtime = new URL(DATABASE_URL);
  if (admin.host !== runtime.host || admin.pathname !== runtime.pathname) throw new Error('Database targets differ.');
  const sql = postgres(MIGRATION_DATABASE_URL, { ...connectionOptions(MIGRATION_DATABASE_URL), max: 1 });
  try {
    const password = decodeURIComponent(runtime.password);
    // PostgreSQL quotes the literal; no password is put in shell args or output.
    const [row] = await sql`select format('ALTER ROLE clinic_runtime LOGIN PASSWORD %L', ${password}::text) as statement`;
    await sql.unsafe(row.statement);
    console.log('Local runtime login configured. Credentials were not printed.');
  } finally { await sql.end(); }
}
main().catch(() => { console.error('Local runtime setup failed. Apply migrations and check both local connection settings.'); process.exitCode = 1; });

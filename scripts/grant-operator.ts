import './load-env.ts';
import postgres from 'postgres';
import { z } from 'zod';
import { migrationEnvironment, requireLocalDatabase, connectionOptions } from '../src/lib/config/environment.ts';

// Makes a verified Supabase Auth user a platform operator (creates clinics, suspends, reactivates).
// Operators are not clinic members and get no patient access. Usage: pnpm operator:grant <auth-user-uuid> "<name>"
async function main() {
  const authUserId = z.uuid().parse(process.argv[2]);
  const displayName = z.string().trim().min(2).max(120).parse(process.argv[3]);
  const { MIGRATION_DATABASE_URL: url } = migrationEnvironment(process.env);
  requireLocalDatabase(url);
  const db = postgres(url, { ...connectionOptions(url), max: 1 });
  try {
    await db`insert into clinic_app.platform_operators(auth_user_id, display_name) values (${authUserId}, ${displayName}) on conflict (auth_user_id) do update set active = true, display_name = excluded.display_name`;
    console.log('Operator access granted. Sign in at /operator.');
  } finally { await db.end(); }
}
main().catch(() => { console.error('Operator grant failed: pass a Supabase Auth user UUID and a display name, and check the local database. No credentials logged.'); process.exitCode = 1; });

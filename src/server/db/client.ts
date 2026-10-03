import 'server-only';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getDatabaseEnvironment } from '@/lib/env.server';
import { connectionOptions } from '@/lib/config/environment';

// Runtime access uses a restricted role. Services enforce staff membership and permissions.
let instance: ReturnType<typeof createDatabase> | undefined;
function createDatabase() {
  const { DATABASE_URL } = getDatabaseEnvironment();
  const sql = postgres(DATABASE_URL, connectionOptions(DATABASE_URL));
  return drizzle(sql);
}
export function getDatabase() { return instance ??= createDatabase(); }

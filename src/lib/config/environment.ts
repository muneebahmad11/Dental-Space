import { z } from 'zod';

const databaseUrl = z.string().min(1).refine(value => {
  try { const url = new URL(value); return ['postgres:', 'postgresql:'].includes(url.protocol) && !!url.hostname && !!url.username && !!url.password && url.pathname.length > 1; } catch { return false; }
});
const databaseSchema = z.object({ DATABASE_URL: databaseUrl });
const migrationSchema = z.object({ MIGRATION_DATABASE_URL: databaseUrl });
const supabaseSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});
function parse<T>(schema: z.ZodType<T>, values: Record<string, string | undefined>): T {
  const result = schema.safeParse(values);
  if (!result.success) throw new Error(`Missing or invalid configuration: ${[...new Set(result.error.issues.map(i => i.path.join('.')))].join(', ')}`);
  return result.data;
}
export function runtimeEnvironment(values: Record<string, string | undefined>) {
  const env = parse(databaseSchema, values);
  // Supavisor custom-role usernames may append the project reference.
  if (decodeURIComponent(new URL(env.DATABASE_URL).username).split('.')[0] !== 'clinic_runtime') throw new Error('DATABASE_URL must use the restricted clinic_runtime role.');
  return env;
}
export function migrationEnvironment(values: Record<string, string | undefined>) {
  const env = parse(migrationSchema, values);
  if (decodeURIComponent(new URL(env.MIGRATION_DATABASE_URL).username).split('.')[0] === 'clinic_runtime') throw new Error('MIGRATION_DATABASE_URL must use a separate migration role.');
  return env;
}
export function supabaseEnvironment(values: Record<string, string | undefined>) { return parse(supabaseSchema, values); }
export function isLocalDatabase(value: string) { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname); }
export function requireLocalDatabase(value: string) { if (!isLocalDatabase(value)) throw new Error('This local preparation command refuses remote database targets.'); }
export function connectionOptions(value: string) {
  return { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10, ssl: isLocalDatabase(value) ? false as const : 'verify-full' as const };
}

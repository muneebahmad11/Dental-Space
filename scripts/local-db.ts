import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import nextEnv from '@next/env';
import { migrationEnvironment, runtimeEnvironment, requireLocalDatabase } from '../src/lib/config/environment.ts';

const bin = process.env.POSTGRES_BIN ?? '/opt/homebrew/opt/postgresql@17/bin';
const root = resolve('.local'); const data = resolve(root, 'postgres'); const socket = resolve(root, 'pgsocket');
function run(name: string, args: string[], extraEnv: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(resolve(bin, name), args, { env: extraEnv, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${name} failed. Review .local/postgres.log if the server could not start.`);
}
try {
  const action = process.argv[2] ?? 'start';
  if (!['start', 'stop', 'status'].includes(action)) throw new Error('Use start, stop or status.');
  if (!existsSync(resolve(bin, 'pg_ctl'))) throw new Error('PostgreSQL is unavailable. Set POSTGRES_BIN to its bin directory.');
  if (action === 'stop') { run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); console.log('Project PostgreSQL stopped; data preserved.'); }
  else if (action === 'status') { run('pg_ctl', ['-D', data, 'status']); console.log('Project PostgreSQL is running.'); }
  else {
    mkdirSync(root, { recursive: true, mode: 0o700 }); mkdirSync(socket, { recursive: true, mode: 0o700 });
    if (!existsSync('.env.local')) {
      const password = randomBytes(24).toString('hex'); const runtime = randomBytes(24).toString('hex');
      writeFileSync('.env.local', `DATABASE_URL=postgresql://clinic_runtime:${runtime}@127.0.0.1:54329/dental_local\nMIGRATION_DATABASE_URL=postgresql://clinic_migrator:${password}@127.0.0.1:54329/dental_local\nNEXT_PUBLIC_APP_URL=http://localhost:3000\nNEXT_PUBLIC_SUPABASE_URL=\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\n`, { flag: 'wx', mode: 0o600 });
    }
    nextEnv.loadEnvConfig(process.cwd(), true);
    const adminUrl = migrationEnvironment(process.env).MIGRATION_DATABASE_URL;
    const runtimeUrl = runtimeEnvironment(process.env).DATABASE_URL;
    requireLocalDatabase(adminUrl); requireLocalDatabase(runtimeUrl);
    const admin = new URL(adminUrl); const runtime = new URL(runtimeUrl);
    if (admin.hostname !== '127.0.0.1' || admin.port !== '54329' || admin.pathname !== '/dental_local' || admin.username !== 'clinic_migrator' || admin.host !== runtime.host || admin.pathname !== runtime.pathname) throw new Error('Local launcher expects its dedicated 127.0.0.1:54329/dental_local target. Existing settings were preserved.');
    if (!existsSync(resolve(data, 'PG_VERSION'))) {
      const passwordFile = resolve(root, 'init-password');
      writeFileSync(passwordFile, decodeURIComponent(admin.password), { mode: 0o600, flag: 'wx' });
      try { run('initdb', ['-D', data, '-U', 'clinic_migrator', '--pwfile', passwordFile, '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--encoding=UTF8', '--locale=C']); }
      finally { rmSync(passwordFile, { force: true }); }
    }
    const running = spawnSync(resolve(bin, 'pg_ctl'), ['-D', data, 'status'], { encoding: 'utf8' });
    if (running.status !== 0) run('pg_ctl', ['-D', data, '-l', resolve(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p 54329 -k ${socket}`, '-w', 'start']);
    const marker = resolve(root, 'database-created');
    if (!existsSync(marker)) {
      run('createdb', ['-h', '127.0.0.1', '-p', '54329', '-U', 'clinic_migrator', 'dental_local'], { ...process.env, PGPASSWORD: decodeURIComponent(admin.password) });
      writeFileSync(marker, 'dental_local\n', { mode: 0o600 });
    }
    if (readFileSync(marker, 'utf8').trim() !== 'dental_local') throw new Error('Unexpected database marker.');
    console.log('Project PostgreSQL running on 127.0.0.1:54329. Credentials are in ignored .env.local; no secrets printed.');
  }
} catch (error) { console.error(error instanceof Error ? error.message : 'Local PostgreSQL setup failed.'); process.exitCode = 1; }

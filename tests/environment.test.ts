import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionOptions, migrationEnvironment, requireLocalDatabase, runtimeEnvironment, supabaseEnvironment } from '../src/lib/config/environment.ts';
const runtime = 'postgresql://clinic_runtime:test-password@127.0.0.1:54329/dental_local';
test('runtime accepts its restricted role and rejects admin credentials', () => {
  assert.equal(runtimeEnvironment({ DATABASE_URL: runtime }).DATABASE_URL, runtime);
  assert.throws(() => runtimeEnvironment({ DATABASE_URL: runtime.replace('clinic_runtime', 'postgres') }), /restricted/);
  assert.throws(() => migrationEnvironment({ MIGRATION_DATABASE_URL: runtime }), /separate/);
});
test('configuration errors never include supplied credentials', () => {
  assert.throws(() => runtimeEnvironment({ DATABASE_URL: 'password-secret-invalid-url' }), e => e instanceof Error && e.message.includes('DATABASE_URL') && !e.message.includes('password-secret'));
  assert.throws(() => runtimeEnvironment({}), /DATABASE_URL/);
  assert.throws(() => supabaseEnvironment({}), /NEXT_PUBLIC_SUPABASE/);
});
test('remote migration targets are refused and remote runtime TLS is verified', () => {
  assert.doesNotThrow(() => requireLocalDatabase(runtime));
  const remote = runtime.replace('127.0.0.1', 'example.supabase.com');
  assert.throws(() => requireLocalDatabase(remote), /refuses remote/);
  assert.equal(connectionOptions(remote).ssl, 'verify-full');
  assert.equal(connectionOptions(runtime).prepare, false);
});
test('Supavisor runtime role names are accepted without permitting admin roles', () => {
  assert.doesNotThrow(() => runtimeEnvironment({ DATABASE_URL: runtime.replace('clinic_runtime', 'clinic_runtime.projectref') }));
  assert.throws(() => runtimeEnvironment({ DATABASE_URL: runtime.replace('clinic_runtime', 'postgres.projectref') }), /restricted/);
});

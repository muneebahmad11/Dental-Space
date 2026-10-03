import './load-env.ts';
import assert from 'node:assert/strict';
const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const base = 'http://127.0.0.1:3000';
for (const path of ['/api/v1/plans', '/api/v1/reports/finance', '/api/v1/patients', '/api/v1/session', '/api/v1/audit-events', '/api/v1/appointments', '/api/v1/overview', '/api/v1/expenses', '/api/v1/communications', '/api/v1/closings', '/api/v1/visits', '/api/v1/patients/00000000-0000-4000-8000-000000000001/account', '/api/v1/receipts/00000000-0000-4000-8000-000000000001']) {
  const result = await fetch(`${base}${path}`);
  assert.equal(result.status, configured ? 401 : 503);
  assert.match(result.headers.get('cache-control') || '', /no-store/);
  const data = await result.json();
  assert.equal(data.error.code, configured ? 'UNAUTHENTICATED' : 'AUTH_NOT_CONFIGURED');
  assert.deepEqual(Object.keys(data), ['error']);
}
const rejected = await fetch(`${base}/api/v1/patients`, { method: 'POST', headers: { origin: 'https://untrusted.invalid', 'content-type': 'application/json' }, body: '{}' });
assert.equal(rejected.status, 403);
assert.equal((await rejected.json()).error.code, 'INVALID_ORIGIN');
console.log('Anonymous local API checks passed: no record disclosure, private responses and foreign-origin mutation denial.');

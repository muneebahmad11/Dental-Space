import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clinicDateTime } from '../src/lib/time.ts';

test('moments are shown in the clinic timezone regardless of where the code runs', () => {
  assert.match(clinicDateTime('2026-11-11T19:30:00Z', 'Asia/Karachi'), /12.Nov.2026.*12:30/);
  assert.match(clinicDateTime('2026-11-11T19:30:00Z', 'Europe/London'), /11.Nov.2026.*7:30/);
});
test('no screen formats a time with the browser timezone', () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name)] : []);
  const bare = [...files('src/app'), ...files('src/components/live'), ...files('src/components/operator')].filter(path => /\.toLocale(String|DateString|TimeString)\(/.test(readFileSync(path, 'utf8')));
  assert.deepEqual(bare, [], 'Use clinicDateTime from src/lib/time.ts');
});

test('dates read the way staff write them', async () => {
  const { clinicDate, clinicDateTime } = await import('../src/lib/time.ts');
  assert.equal(clinicDateTime('2026-11-11T19:30:00Z', 'Asia/Karachi'), '12 Nov 2026, 12:30 am');
  assert.equal(clinicDateTime('2026-11-12T09:05:00Z', 'Asia/Karachi'), '12 Nov 2026, 2:05 pm');
  assert.equal(clinicDate('2026-11-14'), '14 Nov 2026');
  assert.equal(clinicDate('2026-01-01'), '1 Jan 2026');
  assert.equal(clinicDate(''), '');
});

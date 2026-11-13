import 'server-only';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { assertStaffAccess } from '@/server/auth/context';
import { requireIdentity } from '@/server/auth/session';
import { getDatabase } from '@/server/db/client';
import { AppError } from './errors';

export async function patientScope(request: Request) {
  const authUserId = await requireIdentity();
  const parsed = z.object({ clinicId: z.uuid(), branchId: z.uuid() }).safeParse({ clinicId: request.headers.get('x-clinic-id'), branchId: request.headers.get('x-branch-id') });
  if (!parsed.success) throw new AppError(400, 'INVALID_SCOPE', 'Select a clinic and branch.');
  // These headers select scope, never confer membership or permissions. Membership and the clinic's
  // subscription are checked here, before the route reads any input.
  await assertStaffAccess(getDatabase(), authUserId, parsed.data.clinicId, parsed.data.branchId);
  return { authUserId, ...parsed.data };
}
export function requireSameOrigin(request: Request) {
  let origin: string;
  try { origin = new URL(process.env.NEXT_PUBLIC_APP_URL || '').origin; }
  catch { throw new AppError(503, 'APP_NOT_CONFIGURED', 'Application origin is not configured.'); }
  // Cross-site request protection: the browser's Origin must be the configured app address or the address this request
  // was served on (a preview deployment, www vs bare domain, or a local production test). Browsers always send a
  // foreign site's real origin, so another site still cannot submit here.
  const sent = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
  const served = host ? `${proto}://${host}` : null;
  if (!sent || (sent !== origin && sent !== served)) throw new AppError(403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
}
export async function jsonBody(request: Request, maximumBytes = 16384): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new AppError(415, 'JSON_REQUIRED', 'Send a JSON request.');
  // Bound actual bytes, not just the caller-controlled Content-Length header.
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, 'INVALID_JSON', 'Request body is required.');
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) { await reader.cancel(); throw new AppError(413, 'BODY_TOO_LARGE', 'Request body is too large.'); }
      parts.push(value);
    }
    try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
    catch { throw new AppError(400, 'INVALID_JSON', 'Request body must contain valid JSON.'); }
  } finally { reader.releaseLock(); }
}
export function response(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, x-clinic-id, x-branch-id' } });
}
// Unexpected errors are logged for the operator without their message: database messages can quote patient values.
function report(error: unknown) {
  const e = error as { name?: string; code?: string; constraint_name?: string; table_name?: string; cause?: { code?: string; constraint_name?: string; table_name?: string }; stack?: string };
  console.error(JSON.stringify({ level: 'error', event: 'unhandled_request_error', name: e?.name ?? typeof error, code: e?.cause?.code ?? e?.code, constraint: e?.cause?.constraint_name ?? e?.constraint_name, table: e?.cause?.table_name ?? e?.table_name, at: e?.stack?.split('\n').slice(1, 4).map(line => line.trim()) }));
}
export function failure(error: unknown) {
  if (!(error instanceof AppError)) report(error);
  return error instanceof AppError ? response({ error: { code: error.code, message: error.message } }, error.status) : response({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' } }, 500);
}

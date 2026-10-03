import 'server-only';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { requireIdentity } from '@/server/auth/session';
import { AppError } from './errors';

export async function patientScope(request: Request) {
  const authUserId = await requireIdentity();
  const parsed = z.object({ clinicId: z.uuid(), branchId: z.uuid() }).safeParse({ clinicId: request.headers.get('x-clinic-id'), branchId: request.headers.get('x-branch-id') });
  if (!parsed.success) throw new AppError(400, 'INVALID_SCOPE', 'Select a clinic and branch.');
  // These headers select scope, never confer membership or permissions.
  return { authUserId, ...parsed.data };
}
export function requireSameOrigin(request: Request) {
  let origin: string;
  try { origin = new URL(process.env.NEXT_PUBLIC_APP_URL || '').origin; }
  catch { throw new AppError(503, 'APP_NOT_CONFIGURED', 'Application origin is not configured.'); }
  if (request.headers.get('origin') !== origin) throw new AppError(403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
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
export function failure(error: unknown) {
  return error instanceof AppError ? response({ error: { code: error.code, message: error.message } }, error.status) : response({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' } }, 500);
}

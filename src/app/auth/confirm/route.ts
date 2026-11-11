import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authClient } from '@/server/auth/session';
export const dynamic = 'force-dynamic';
// Invite and password-reset emails link here with a one-time token hash (see docs/runbooks/operator-console.md).
// A valid token starts a session in this browser; the person then chooses a password.
export async function GET(request: Request) {
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
  const query = new URL(request.url).searchParams;
  const input = z.object({ token_hash: z.string().min(10).max(500), type: z.enum(['invite', 'recovery']) }).safeParse({ token_hash: query.get('token_hash'), type: query.get('type') });
  try {
    if (!input.success) throw new Error('INVALID_LINK');
    const { error } = await (await authClient()).auth.verifyOtp(input.data);
    if (error) throw error;
    return NextResponse.redirect(`${origin}/auth/set-password`, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch { return NextResponse.redirect(`${origin}/auth/set-password?link=expired`, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }); }
}

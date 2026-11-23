import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authClient } from '@/server/auth/session';
export const dynamic = 'force-dynamic';
// Invite and password-reset emails link here, either with a one-time token hash (custom email templates, see
// docs/runbooks/operator-console.md) or with a one-time code (Supabase's standard templates).
// A valid token starts a session in this browser; the person then chooses a password.
export async function GET(request: Request) {
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
  const query = new URL(request.url).searchParams;
  const input = z.object({ token_hash: z.string().min(10).max(500), type: z.enum(['invite', 'recovery']) }).safeParse({ token_hash: query.get('token_hash'), type: query.get('type') });
  // Supabase's standard emails instead arrive with a one-time code, which only the browser that asked for the email can use.
  const code = z.string().min(10).max(500).safeParse(query.get('code'));
  try {
    const auth = (await authClient()).auth;
    if (input.success) { const { error } = await auth.verifyOtp(input.data); if (error) throw error; }
    else if (code.success) { const { error } = await auth.exchangeCodeForSession(code.data); if (error) throw error; }
    else throw new Error('INVALID_LINK');
    return NextResponse.redirect(`${origin}/auth/set-password`, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch { return NextResponse.redirect(`${origin}/auth/set-password?link=expired`, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }); }
}

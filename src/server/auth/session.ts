import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseEnvironment } from '@/lib/config/environment';
import { AppError } from '@/server/http/errors';

export async function authClient() {
  let env;
  try { env = supabaseEnvironment(process.env); }
  catch { throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Staff authentication is not configured yet.'); }
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: values => { for (const { name, value, options } of values) cookieStore.set(name, value, options); },
    },
  });
}

export async function requireIdentity() {
  const client = await authClient();
  // Cookie contents alone do not establish identity: getClaims verifies the access token's signature and expiry
  // against the project's published asymmetric signing keys (cached), avoiding an Auth-server round trip per request.
  // A revoked Supabase session stays valid until its short access-token expiry; staff deactivation is still
  // enforced on every request by the membership checks in resolveContext.
  const { data, error } = await client.auth.getClaims();
  const subject = data?.claims?.sub;
  if (error || !subject || data.claims.is_anonymous) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  return subject;
}

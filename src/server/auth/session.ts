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
  // Verify with the Auth server; cookie contents alone do not establish identity.
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  return data.user.id;
}

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { isLocalDatabase, supabaseEnvironment } from '@/lib/config/environment';
import type { EmailVerifier, InviteSender } from '@/server/operator/service';

// SUPABASE_SECRET_KEY is server-only and optional. Without it no invite email is sent and the operator
// tells the owner to use "Forgot password"; the invite still binds on their first sign-in.
function adminClient() {
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) return null;
  const env = supabaseEnvironment(process.env);
  return { env, client: createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } }) };
}
export const sendInvite: InviteSender = async email => {
  const admin = adminClient();
  if (!admin) return 'not_sent';
  const { error } = await admin.client.auth.admin.inviteUserByEmail(email, { redirectTo: `${new URL(admin.env.NEXT_PUBLIC_APP_URL).origin}/auth/set-password` });
  if (!error) return 'email_sent';
  return error.code === 'email_exists' || error.status === 422 ? 'existing_account' : 'failed';
};
// With the secret key, the Auth server confirms the address belongs to this user and was confirmed.
// Without it, the signed token's email claim is trusted only against a local development database.
export const emailVerified: EmailVerifier = async (authUserId, email) => {
  const admin = adminClient();
  if (!admin) return isLocalDatabase(process.env.DATABASE_URL || 'postgresql://remote.invalid/x');
  const { data, error } = await admin.client.auth.admin.getUserById(authUserId);
  return !error && !!data.user?.email_confirmed_at && data.user.email?.toLowerCase() === email;
};

import { authClient } from '@/server/auth/session';
import { failure, requireSameOrigin, response } from '@/server/http/patient-request';
import { AppError } from '@/server/http/errors';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const client = await authClient();
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw new AppError(503, 'SIGN_OUT_FAILED', 'Sign-out failed. Try again.');
    return response({ signedOut: true });
  } catch (error) { return failure(error); }
}

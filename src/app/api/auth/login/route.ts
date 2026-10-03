import { z } from 'zod';
import { authClient } from '@/server/auth/session';
import { failure, jsonBody, requireSameOrigin, response } from '@/server/http/patient-request';
import { AppError } from '@/server/http/errors';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = z.object({ email: z.email().max(254), password: z.string().min(1).max(256) }).strict().safeParse(await jsonBody(request));
    if (!input.success) throw new AppError(400, 'INVALID_INPUT', 'Enter your email and password.');
    const client = await authClient();
    const { error } = await client.auth.signInWithPassword(input.data);
    if (error) throw new AppError(error.status === 429 ? 429 : 401, 'SIGN_IN_FAILED', error.status === 429 ? 'Too many attempts. Try again later.' : 'Sign-in failed. Check your email and password.');
    return response({ signedIn: true });
  } catch (error) { return failure(error); }
}

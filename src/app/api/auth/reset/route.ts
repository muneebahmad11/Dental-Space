import { z } from 'zod';
import { authClient } from '@/server/auth/session';
import { AppError } from '@/server/http/errors';
import { failure, jsonBody, requireSameOrigin, response } from '@/server/http/patient-request';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = z.object({ email: z.email().max(254) }).strict().safeParse(await jsonBody(request));
    if (!input.success) throw new AppError(400, 'INVALID_INPUT', 'Enter your email address.');
    const { error } = await (await authClient()).auth.resetPasswordForEmail(input.data.email);
    if (error?.status === 429) throw new AppError(429, 'TOO_MANY_REQUESTS', 'Too many attempts. Try again later.');
    // The same answer whether or not the address has an account.
    return response({ requested: true });
  } catch (error) { return failure(error); }
}

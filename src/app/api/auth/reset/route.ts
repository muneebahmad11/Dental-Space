import { z } from 'zod';
import { authClient } from '@/server/auth/session';
import { AppError } from '@/server/http/errors';
import { failure, jsonBody, requireSameOrigin, response } from '@/server/http/patient-request';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = z.object({ email: z.email().max(254) }).strict().safeParse(await jsonBody(request));
    if (!input.success) throw new AppError(400, 'INVALID_INPUT', 'Enter your email address.');
    // The emailed link comes back to this app's confirm page, which finishes the reset in this same browser.
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
    const { error } = await (await authClient()).auth.resetPasswordForEmail(input.data.email, { redirectTo: `${origin}/auth/confirm` });
    if (error?.status === 429) throw new AppError(429, 'TOO_MANY_REQUESTS', 'Too many attempts. Try again later.');
    // The same answer whether or not the address has an account.
    return response({ requested: true });
  } catch (error) { return failure(error); }
}

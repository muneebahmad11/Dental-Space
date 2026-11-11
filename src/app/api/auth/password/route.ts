import { z } from 'zod';
import { authClient, requireIdentity } from '@/server/auth/session';
import { AppError } from '@/server/http/errors';
import { failure, jsonBody, requireSameOrigin, response } from '@/server/http/patient-request';
// Sets the password of the signed-in person (after an invite or reset link). Never accepts a target account.
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireIdentity();
    const input = z.object({ password: z.string().min(10).max(256) }).strict().safeParse(await jsonBody(request));
    if (!input.success) throw new AppError(400, 'INVALID_INPUT', 'Choose a password of at least 10 characters.');
    const { error } = await (await authClient()).auth.updateUser({ password: input.data.password });
    if (error) throw new AppError(error.status === 422 ? 400 : 503, 'PASSWORD_NOT_SAVED', error.status === 422 ? 'Choose a stronger password, different from your last one.' : 'Password could not be saved. Try again.');
    return response({ saved: true });
  } catch (error) { return failure(error); }
}

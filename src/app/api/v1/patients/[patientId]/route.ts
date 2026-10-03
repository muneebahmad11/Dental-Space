import { z } from 'zod';
import { getDatabase } from '@/server/db/client';
import { patientInput, updatePatient } from '@/server/patients/service';
import { failure, jsonBody, patientScope, requireSameOrigin, response } from '@/server/http/patient-request';
import { AppError } from '@/server/http/errors';
export const runtime = 'nodejs';
export async function PATCH(request: Request, route: { params: Promise<{ patientId: string }> }) {
  try {
    requireSameOrigin(request);
    const scope = await patientScope(request);
    const input = z.object({ expectedVersion: z.number().int().positive(), patient: patientInput }).strict().safeParse(await jsonBody(request));
    if (!input.success) throw new AppError(400, 'INVALID_INPUT', 'Check the supplied patient details and version.');
    const { patientId } = await route.params;
    return response({ patient: await updatePatient(getDatabase(), scope, patientId, input.data.expectedVersion, input.data.patient) });
  } catch (error) { return failure(error); }
}

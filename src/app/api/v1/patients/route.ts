import { getDatabase } from '@/server/db/client';
import { createPatient, listPatients } from '@/server/patients/service';
import { failure, jsonBody, patientScope, requireSameOrigin, response } from '@/server/http/patient-request';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const scope = await patientScope(request);
    const query = new URL(request.url).searchParams;
    return response({ patients: await listPatients(getDatabase(), scope, { search: query.get('search') || '', offset: Number(query.get('offset') || 0) }) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const scope = await patientScope(request);
    return response({ patient: await createPatient(getDatabase(), scope, await jsonBody(request)) }, 201);
  } catch (error) { return failure(error); }
}

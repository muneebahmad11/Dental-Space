import { saveClinicLogo } from '@/server/clinic/settings';
import { getDatabase } from '@/server/db/client';
import { failure, jsonBody, patientScope, requireSameOrigin, response } from '@/server/http/patient-request';
export const dynamic = 'force-dynamic';
// The logo is a resized data URL (at most 200 KB of image), so the body limit is raised for this route only.
export async function PUT(request: Request) { try { requireSameOrigin(request); const scope = await patientScope(request); return response(await saveClinicLogo(getDatabase(), scope, await jsonBody(request, 320000))); } catch (e) { return failure(e); } }

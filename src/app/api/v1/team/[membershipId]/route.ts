import { getDatabase } from '@/server/db/client';
import { failure, jsonBody, patientScope, requireSameOrigin, response } from '@/server/http/patient-request';
import { updateStaff } from '@/server/staff/service';
export const dynamic = 'force-dynamic';
export async function PATCH(request: Request, { params }: { params: Promise<{ membershipId: string }> }) { try { requireSameOrigin(request); const scope = await patientScope(request); return response(await updateStaff(getDatabase(), scope, (await params).membershipId, await jsonBody(request))); } catch (e) { return failure(e); } }

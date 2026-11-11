import { sendInvite } from '@/server/auth/admin';
import { getDatabase } from '@/server/db/client';
import { failure, jsonBody, patientScope, requireSameOrigin, response } from '@/server/http/patient-request';
import { inviteStaff, listStaff } from '@/server/staff/service';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { try { const scope = await patientScope(request); return response(await listStaff(getDatabase(), scope)); } catch (e) { return failure(e); } }
export async function POST(request: Request) { try { requireSameOrigin(request); const scope = await patientScope(request); return response({ invite: await inviteStaff(getDatabase(), scope, await jsonBody(request), sendInvite) }, 201); } catch (e) { return failure(e); } }

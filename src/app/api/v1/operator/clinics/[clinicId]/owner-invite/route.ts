import { sendInvite } from '@/server/auth/admin';
import { getDatabase } from '@/server/db/client';
import { operatorIdentity } from '@/server/http/operator-request';
import { failure, jsonBody, requireSameOrigin, response } from '@/server/http/patient-request';
import { inviteOwner } from '@/server/operator/service';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, { params }: { params: Promise<{ clinicId: string }> }) { try { requireSameOrigin(request); const operator = await operatorIdentity(); return response({ invite: await inviteOwner(getDatabase(), operator, (await params).clinicId, await jsonBody(request), sendInvite) }, 201); } catch (e) { return failure(e); } }

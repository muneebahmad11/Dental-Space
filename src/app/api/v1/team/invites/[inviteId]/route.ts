import { getDatabase } from '@/server/db/client';
import { failure, patientScope, requireSameOrigin, response } from '@/server/http/patient-request';
import { revokeInvite } from '@/server/staff/service';
export const dynamic = 'force-dynamic';
export async function DELETE(request: Request, { params }: { params: Promise<{ inviteId: string }> }) { try { requireSameOrigin(request); const scope = await patientScope(request); return response(await revokeInvite(getDatabase(), scope, (await params).inviteId)); } catch (e) { return failure(e); } }

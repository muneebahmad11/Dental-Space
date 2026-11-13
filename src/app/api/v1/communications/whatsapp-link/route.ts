import { getDatabase } from '@/server/db/client';
import { failure, jsonBody, patientScope, requireSameOrigin, response } from '@/server/http/patient-request';
import { whatsappLink } from '@/server/messaging/click-to-chat';
export const dynamic = 'force-dynamic';
// POST, not GET: opening a message is audited.
export async function POST(request: Request) { try { requireSameOrigin(request); const scope = await patientScope(request); return response(await whatsappLink(getDatabase(), scope, await jsonBody(request))); } catch (e) { return failure(e); } }

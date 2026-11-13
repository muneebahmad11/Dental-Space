import { getDatabase } from '@/server/db/client';
import { failure, jsonBody, patientScope, requireSameOrigin, response } from '@/server/http/patient-request';
import { saveMessageTemplates } from '@/server/messaging/click-to-chat';
export const dynamic = 'force-dynamic';
export async function PUT(request: Request) { try { requireSameOrigin(request); const scope = await patientScope(request); return response(await saveMessageTemplates(getDatabase(), scope, await jsonBody(request))); } catch (e) { return failure(e); } }

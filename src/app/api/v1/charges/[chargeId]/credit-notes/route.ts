import { getDatabase } from '@/server/db/client';
import { postCreditNote } from '@/server/finance/service';
import { failure, jsonBody, patientScope, requireSameOrigin, response } from '@/server/http/patient-request';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, { params }: { params: Promise<{ chargeId: string }> }) { try { requireSameOrigin(request); const scope = await patientScope(request); return response({ creditNote: await postCreditNote(getDatabase(), scope, (await params).chargeId, await jsonBody(request)) }, 201); } catch (e) { return failure(e); } }

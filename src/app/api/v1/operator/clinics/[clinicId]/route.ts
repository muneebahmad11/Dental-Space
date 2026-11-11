import { getDatabase } from '@/server/db/client';
import { operatorIdentity } from '@/server/http/operator-request';
import { failure, jsonBody, requireSameOrigin, response } from '@/server/http/patient-request';
import { operatorAudit, updateClinic } from '@/server/operator/service';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ clinicId: string }> };
export async function GET(_: Request, { params }: Params) { try { return response({ events: await operatorAudit(getDatabase(), await operatorIdentity(), (await params).clinicId) }); } catch (e) { return failure(e); } }
export async function PATCH(request: Request, { params }: Params) { try { requireSameOrigin(request); const operator = await operatorIdentity(); return response({ clinic: await updateClinic(getDatabase(), operator, (await params).clinicId, await jsonBody(request)) }); } catch (e) { return failure(e); } }

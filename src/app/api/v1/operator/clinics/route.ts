import { sendInvite } from '@/server/auth/admin';
import { getDatabase } from '@/server/db/client';
import { operatorIdentity } from '@/server/http/operator-request';
import { failure, jsonBody, requireSameOrigin, response } from '@/server/http/patient-request';
import { createClinic, listClinics } from '@/server/operator/service';
export const dynamic = 'force-dynamic';
export async function GET() { try { return response(await listClinics(getDatabase(), await operatorIdentity())); } catch (e) { return failure(e); } }
export async function POST(request: Request) { try { requireSameOrigin(request); const operator = await operatorIdentity(); return response({ clinic: await createClinic(getDatabase(), operator, await jsonBody(request), sendInvite) }, 201); } catch (e) { return failure(e); } }

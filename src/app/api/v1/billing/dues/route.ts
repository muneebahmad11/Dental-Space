import { getDatabase } from '@/server/db/client';
import { unpaidBalances } from '@/server/finance/dues';
import { failure, patientScope, response } from '@/server/http/patient-request';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { try { const scope = await patientScope(request); const q = Object.fromEntries(new URL(request.url).searchParams); return response(await unpaidBalances(getDatabase(), scope, q)); } catch (e) { return failure(e); } }

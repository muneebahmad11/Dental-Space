import { getDatabase } from '@/server/db/client';
import { importStarterProcedures } from '@/server/procedures/service';
import { failure, patientScope, requireSameOrigin, response } from '@/server/http/patient-request';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { try { requireSameOrigin(request); const scope = await patientScope(request); return response(await importStarterProcedures(getDatabase(), scope), 201); } catch (e) { return failure(e); } }

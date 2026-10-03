import { getDatabase } from '@/server/db/client';
import { listAuditEvents } from '@/server/audit/query';
import { failure, patientScope, response } from '@/server/http/patient-request';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { return response({ events: await listAuditEvents(getDatabase(), await patientScope(request)) }); }
  catch (error) { return failure(error); }
}

import { getDatabase } from '@/server/db/client';
import { failure, patientScope, response } from '@/server/http/patient-request';
import { financeReport } from '@/server/reports/service';

export async function GET(request:Request) {
  try {
    const scope = await patientScope(request);
    const params = new URL(request.url).searchParams;
    return response(await financeReport(getDatabase(),scope,{from:params.get('from'),to:params.get('to')}));
  } catch (error) { return failure(error); }
}

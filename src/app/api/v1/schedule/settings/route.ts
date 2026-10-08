import { getDatabase } from '@/server/db/client';
import { getScheduleSettings } from '@/server/scheduling/settings';
import { failure,patientScope,response } from '@/server/http/patient-request';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return response(await getScheduleSettings(getDatabase(),await patientScope(request)));}catch(e){return failure(e);}}

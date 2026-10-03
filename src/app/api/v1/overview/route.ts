import { getDatabase } from '@/server/db/client';
import { clinicOverview } from '@/server/overview/query';
import { failure,patientScope,response } from '@/server/http/patient-request';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const scope=await patientScope(request);const params=new URL(request.url).searchParams;return response(await clinicOverview(getDatabase(),scope,{startsAt:params.get('startsAt'),endsAt:params.get('endsAt')}));}catch(e){return failure(e);}}

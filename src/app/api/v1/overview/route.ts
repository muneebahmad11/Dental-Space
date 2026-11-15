import { getDatabase } from '@/server/db/client';
import { appointmentTrend,clinicOverview } from '@/server/overview/query';
import { failure,patientScope,response } from '@/server/http/patient-request';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const scope=await patientScope(request);const params=new URL(request.url).searchParams;if(params.has('trend'))return response(await appointmentTrend(getDatabase(),scope,params.get('trend')));return response(await clinicOverview(getDatabase(),scope,{startsAt:params.get('startsAt'),endsAt:params.get('endsAt')}));}catch(e){return failure(e);}}

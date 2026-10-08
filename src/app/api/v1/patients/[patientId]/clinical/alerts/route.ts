import { getDatabase } from '@/server/db/client';
import { listPatientAlerts,createPatientAlert } from '@/server/patient-clinical/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
type Context={params:Promise<{patientId:string}>};
export async function GET(request:Request,{params}:Context){try{return response(await listPatientAlerts(getDatabase(),await patientScope(request),(await params).patientId,Object.fromEntries(new URL(request.url).searchParams)));}catch(e){return failure(e);}}
export async function POST(request:Request,{params}:Context){try{requireSameOrigin(request);return response(await createPatientAlert(getDatabase(),await patientScope(request),(await params).patientId,await jsonBody(request)));}catch(e){return failure(e);}}

import { getDatabase } from '@/server/db/client';
import { readPatientAlert,updatePatientAlert } from '@/server/patient-clinical/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
type Context={params:Promise<{patientId:string;alertId:string}>};
export async function GET(request:Request,{params}:Context){try{const p=await params;return response(await readPatientAlert(getDatabase(),await patientScope(request),p.patientId,p.alertId));}catch(e){return failure(e);}}
export async function PATCH(request:Request,{params}:Context){try{requireSameOrigin(request);const p=await params;return response(await updatePatientAlert(getDatabase(),await patientScope(request),p.patientId,p.alertId,await jsonBody(request)));}catch(e){return failure(e);}}

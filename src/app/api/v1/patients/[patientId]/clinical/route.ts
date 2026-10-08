import { getDatabase } from '@/server/db/client';
import { readPatientClinical,savePatientHistory } from '@/server/patient-clinical/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
type Context={params:Promise<{patientId:string}>};
export async function GET(request:Request,{params}:Context){try{return response(await readPatientClinical(getDatabase(),await patientScope(request),(await params).patientId));}catch(e){return failure(e);}}
export async function POST(request:Request,{params}:Context){try{requireSameOrigin(request);return response(await savePatientHistory(getDatabase(),await patientScope(request),(await params).patientId,await jsonBody(request,65536)));}catch(e){return failure(e);}}

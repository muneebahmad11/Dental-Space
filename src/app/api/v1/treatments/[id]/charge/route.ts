import { getDatabase } from '@/server/db/client';
import { billTreatment } from '@/server/plans/completion';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{requireSameOrigin(request);return response(await billTreatment(getDatabase(),await patientScope(request),(await params).id,await jsonBody(request)));}catch(e){return failure(e);}}

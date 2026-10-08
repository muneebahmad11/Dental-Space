import { getDatabase } from '@/server/db/client';
import { addClosure } from '@/server/scheduling/settings';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function POST(request:Request){try{requireSameOrigin(request);return response(await addClosure(getDatabase(),await patientScope(request),await jsonBody(request)),201);}catch(e){return failure(e);}}

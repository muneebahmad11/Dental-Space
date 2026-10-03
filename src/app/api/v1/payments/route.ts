import { getDatabase } from '@/server/db/client';
import { postPayment } from '@/server/finance/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function POST(request:Request){try{requireSameOrigin(request);const scope=await patientScope(request);return response(await postPayment(getDatabase(),scope,await jsonBody(request)),201);}catch(e){return failure(e);}}

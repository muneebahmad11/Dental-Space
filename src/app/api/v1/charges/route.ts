import { getDatabase } from '@/server/db/client';
import { postCharge } from '@/server/finance/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function POST(request:Request){try{requireSameOrigin(request);const scope=await patientScope(request);return response({charge:await postCharge(getDatabase(),scope,await jsonBody(request))},201);}catch(e){return failure(e);}}

import { getDatabase } from '@/server/db/client';
import { setMessagingPreference } from '@/server/messaging/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function POST(request:Request){try{requireSameOrigin(request);const scope=await patientScope(request);return response({preference:await setMessagingPreference(getDatabase(),scope,await jsonBody(request))});}catch(e){return failure(e);}}

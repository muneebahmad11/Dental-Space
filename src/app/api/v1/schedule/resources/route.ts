import { getDatabase } from '@/server/db/client';
import { createScheduleResource } from '@/server/scheduling/settings';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function POST(request:Request){try{requireSameOrigin(request);return response(await createScheduleResource(getDatabase(),await patientScope(request),await jsonBody(request)),201);}catch(e){return failure(e);}}

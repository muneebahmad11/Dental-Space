import { getDatabase } from '@/server/db/client';
import { updateScheduleResource } from '@/server/scheduling/settings';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{requireSameOrigin(request);return response(await updateScheduleResource(getDatabase(),await patientScope(request),(await params).id,await jsonBody(request)));}catch(e){return failure(e);}}

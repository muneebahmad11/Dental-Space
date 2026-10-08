import { getDatabase } from '@/server/db/client';
import { saveOpeningHours } from '@/server/scheduling/settings';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function PUT(request:Request){try{requireSameOrigin(request);return response(await saveOpeningHours(getDatabase(),await patientScope(request),await jsonBody(request)));}catch(e){return failure(e);}}

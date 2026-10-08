import { getDatabase } from '@/server/db/client';
import { bookFollowUp } from '@/server/follow-ups/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{requireSameOrigin(request);return response(await bookFollowUp(getDatabase(),await patientScope(request),(await params).id,await jsonBody(request)));}catch(e){return failure(e);}}

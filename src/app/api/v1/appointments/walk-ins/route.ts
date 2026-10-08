import { getDatabase } from '@/server/db/client';
import { registerWalkIn } from '@/server/appointments/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function POST(request:Request) {try {requireSameOrigin(request); const scope=await patientScope(request); return response({appointment:await registerWalkIn(getDatabase(),scope,await jsonBody(request))},201);}catch(e){return failure(e);} }

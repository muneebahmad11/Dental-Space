import { getDatabase } from '@/server/db/client';
import { createPlan,listPlans } from '@/server/plans/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function GET(request:Request){try{return response({plans:await listPlans(getDatabase(),await patientScope(request))});}catch(e){return failure(e);}}
export async function POST(request:Request){try{requireSameOrigin(request);return response(await createPlan(getDatabase(),await patientScope(request),await jsonBody(request,65536)));}catch(e){return failure(e);}}

import { getDatabase } from '@/server/db/client';
import { readPlan,savePlan } from '@/server/plans/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){try{return response(await readPlan(getDatabase(),await patientScope(request),(await params).id));}catch(e){return failure(e);}}
export async function PATCH(request:Request,{params}:Context){try{requireSameOrigin(request);return response(await savePlan(getDatabase(),await patientScope(request),(await params).id,await jsonBody(request,65536)));}catch(e){return failure(e);}}

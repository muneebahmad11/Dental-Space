import { getDatabase } from '@/server/db/client';
import { patientTimeline } from '@/server/timeline/service';
import { failure,patientScope,response } from '@/server/http/patient-request';
export async function GET(request:Request,{params}:{params:Promise<{patientId:string}>}){try{return response(await patientTimeline(getDatabase(),await patientScope(request),(await params).patientId,Object.fromEntries(new URL(request.url).searchParams)));}catch(e){return failure(e);}}

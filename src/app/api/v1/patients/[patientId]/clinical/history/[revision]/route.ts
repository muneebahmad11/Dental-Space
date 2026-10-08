import { getDatabase } from '@/server/db/client';
import { readHistoryVersion } from '@/server/patient-clinical/service';
import { failure,patientScope,response } from '@/server/http/patient-request';
export async function GET(request:Request,{params}:{params:Promise<{patientId:string;revision:string}>}){try{const p=await params;return response(await readHistoryVersion(getDatabase(),await patientScope(request),p.patientId,p.revision));}catch(e){return failure(e);}}

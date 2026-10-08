import { getDatabase } from '@/server/db/client';
import { recordPatientView } from '@/server/patients/recent';
import { failure,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export async function POST(request:Request,{params}:{params:Promise<{patientId:string}>}){try{requireSameOrigin(request);return response(await recordPatientView(getDatabase(),await patientScope(request),(await params).patientId));}catch(e){return failure(e);}}

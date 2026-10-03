import { getDatabase } from '@/server/db/client';
import { bookAppointment,listAppointments } from '@/server/appointments/service';
import { failure,jsonBody,patientScope,requireSameOrigin,response } from '@/server/http/patient-request';
export const dynamic='force-dynamic';
export async function GET(request:Request) { try { const scope=await patientScope(request); const q=new URL(request.url).searchParams; return response({appointments:await listAppointments(getDatabase(),scope,{startsAt:q.get('startsAt'),endsAt:q.get('endsAt')})}); } catch(e) {return failure(e);} }
export async function POST(request:Request) { try {requireSameOrigin(request); const scope=await patientScope(request); return response({appointment:await bookAppointment(getDatabase(),scope,await jsonBody(request))},201);} catch(e) {return failure(e);} }

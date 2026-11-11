import { readClinicSettings, saveClinicSettings } from '@/server/clinic/settings';
import { getDatabase } from '@/server/db/client';
import { failure, jsonBody, patientScope, requireSameOrigin, response } from '@/server/http/patient-request';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { try { const scope = await patientScope(request); return response(await readClinicSettings(getDatabase(), scope)); } catch (e) { return failure(e); } }
export async function PUT(request: Request) { try { requireSameOrigin(request); const scope = await patientScope(request); return response({ settings: await saveClinicSettings(getDatabase(), scope, await jsonBody(request)) }); } catch (e) { return failure(e); } }

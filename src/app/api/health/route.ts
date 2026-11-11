import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDatabase } from '@/server/db/client';
export const dynamic = 'force-dynamic';
// For uptime monitors. Says only whether the app can reach its database; no versions, names or counts.
export async function GET() {
  try { await getDatabase().execute(sql`select 1`); return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}

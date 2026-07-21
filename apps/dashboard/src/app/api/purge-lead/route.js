// Serverless lead purge — works on Vercel without the Railway backend.
// Verifies the caller is a signed-in staff member, then deletes the lead
// with the service-role key (messages cascade at the database level).
// SUPABASE_SERVICE_ROLE_KEY is a server-only env var — never exposed to the browser.
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Server not configured for lead deletion' }, { status: 500 });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData?.user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { data: staff } = await admin.from('staff_users').select('id, full_name').eq('id', userData.user.id).maybeSingle();
  if (!staff) return NextResponse.json({ error: 'Not a staff member' }, { status: 403 });

  const { leadId } = await request.json().catch(() => ({}));
  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  const { error } = await admin.from('leads').delete().eq('id', leadId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.log(`[purge-lead] ${staff.full_name} deleted lead ${leadId}`);
  return NextResponse.json({ ok: true });
}

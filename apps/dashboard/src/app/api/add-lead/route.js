// Serverless manual + bulk lead creation. Inserts with the service-role key
// (the leads table has no INSERT RLS policy, by design) after verifying the
// caller is a signed-in staff member. POST body:
//   { whatsapp_number, name?, selected_course_id?, selected_state_id? }        → single
//   { leads: [ { whatsapp_number, name?, selected_course_id?, selected_state_id? }, … ] } → bulk
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { normalizeNumber, validNumber } from '../../../lib/leadUtils';

async function authStaff(request) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { res: NextResponse.json({ error: 'Server not configured for lead creation' }, { status: 500 }) };
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { res: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  const { data: { user } = {}, error } = await admin.auth.getUser(token);
  if (error || !user) return { res: NextResponse.json({ error: 'Invalid session' }, { status: 401 }) };
  const { data: staff } = await admin.from('staff_users').select('id, full_name').eq('id', user.id).maybeSingle();
  if (!staff) return { res: NextResponse.json({ error: 'Not a staff member' }, { status: 403 }) };
  return { admin, staff };
}

const shape = (l, source) => ({
  whatsapp_number: normalizeNumber(l.whatsapp_number),
  name: (l.name ?? '').trim() || null,
  entry_source: source,
  flow_status: 'New Lead',
  selected_course_id: l.selected_course_id || null,
  selected_state_id: l.selected_state_id || null,
});

export async function POST(request) {
  const { admin, staff, res } = await authStaff(request);
  if (res) return res;
  const body = await request.json().catch(() => ({}));

  // ── Bulk ──
  if (Array.isArray(body.leads)) {
    let invalid = 0;
    const seen = new Set();
    const rows = [];
    for (const l of body.leads) {
      const r = shape(l, 'Bulk Upload');
      if (!validNumber(r.whatsapp_number)) { invalid += 1; continue; }
      if (seen.has(r.whatsapp_number)) continue;      // dedupe within the file
      seen.add(r.whatsapp_number);
      rows.push(r);
    }
    if (!rows.length) return NextResponse.json({ error: 'No valid WhatsApp numbers found', invalid }, { status: 400 });

    const nums = rows.map((r) => r.whatsapp_number);
    const { data: existing } = await admin.from('leads').select('whatsapp_number').in('whatsapp_number', nums);
    const have = new Set((existing ?? []).map((e) => e.whatsapp_number));
    const toInsert = rows.filter((r) => !have.has(r.whatsapp_number));

    let ids = [];
    if (toInsert.length) {
      const { data, error } = await admin.from('leads').insert(toInsert).select('id');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      ids = data.map((d) => d.id);
    }
    console.log(`[add-lead] ${staff.full_name} bulk: +${ids.length} added, ${have.size} existing, ${invalid} invalid`);
    return NextResponse.json({ ok: true, added: ids.length, skipped: have.size, invalid, total: body.leads.length, ids });
  }

  // ── Single ──
  const row = shape(body, body.entry_source || 'Manual (Admin)');
  if (!validNumber(row.whatsapp_number)) {
    return NextResponse.json({ error: 'Enter a valid WhatsApp number with country code (e.g. 91XXXXXXXXXX)' }, { status: 400 });
  }
  const { data, error } = await admin.from('leads').insert(row).select('id').single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'A lead with this number already exists' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  console.log(`[add-lead] ${staff.full_name} added ${row.whatsapp_number}`);
  return NextResponse.json({ ok: true, id: data.id });
}

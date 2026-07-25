// Hot/Warm counsellor notifications.
//
// Lead temperature is derived from how far the student has progressed. When a
// lead crosses into Warm or Hot (or selects a new college, or asks for a human),
// the assigned counsellor — or the default experts — get a WhatsApp alert.
// De-duped so the same status isn't sent twice; every send is logged.
import { supabase } from '../db/supabase.js';
import { updateLeadFields } from '../crm/leads.js';
import { getSocket, getWaState } from '../whatsapp/connection.js';
import * as cat from './catalog.js';
import { nameOf } from './copy.js';

const SCORE = {
  'New Lead': 20, 'Course Selected': 40, 'State Selected': 55, 'College Selected': 70,
  'Documents Shared': 82, 'Callback Requested': 90, 'Guidance Completed': 92,
  'Counselor Assigned': 85, 'Human Assistance Required': 78, 'Not Interested': 8,
};
const RANK = { Cold: 0, Warm: 1, Hot: 2 };
export const tempOf = (status) => { const v = SCORE[status] ?? 20; return v >= 70 ? 'Hot' : v >= 40 ? 'Warm' : 'Cold'; };

const digits = (p) => String(p || '').replace(/\D/g, '');
const toJid = (p) => { let d = digits(p); if (d.length === 10) d = '91' + d; return `${d}@s.whatsapp.net`; };

async function lastStudentMsg(leadId) {
  const { data } = await supabase.from('messages').select('content')
    .eq('lead_id', leadId).eq('sender', 'student')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data?.content || '—';
}

async function labels(lead) {
  const course = lead.selected_course_id ? (await cat.getCourse(lead.selected_course_id))?.name : lead.other_course;
  const state = lead.selected_state_id ? (await cat.getState(lead.selected_state_id))?.name : (lead.other_state || null);
  const college = lead.selected_college_id ? (await cat.getCollege(lead.selected_college_id))?.name : lead.other_college;
  return { course: course || '—', state: state || '—', college: college || '—' };
}

function template(temp, lead, l, last) {
  const head = temp === 'Hot' ? '🔥 New Hot Lead' : 'New Warm Lead';
  const tail = temp === 'Hot' ? 'Please contact this student as soon as possible.' : 'Please review and follow up with this student.';
  return `${head}\n` +
    `Student Name: ${nameOf(lead)}\n` +
    `Phone Number: +${lead.whatsapp_number}\n` +
    `Course: ${l.course}\n` +
    `State: ${l.state}\n` +
    `College: ${l.college}\n` +
    `Current Stage: ${lead.flow_status || '—'}\n` +
    `Last Message: ${last}\n${tail}`;
}

// Who receives the alert: the assigned counsellor, else all active default experts.
async function recipients(lead) {
  if (lead.assigned_counsellor_id) {
    const { data } = await supabase.from('counsellors').select('*').eq('id', lead.assigned_counsellor_id).maybeSingle();
    if (data?.phone) return [data];
  }
  return (await cat.getActiveCounsellors()).filter((c) => c.phone);
}

async function send(lead, kind, temp) {
  if (getWaState().status !== 'connected') return;
  const [l, last, recips] = await Promise.all([labels(lead), lastStudentMsg(lead.id), recipients(lead)]);
  const body = template(temp === 'Cold' ? 'Warm' : temp, lead, l, last);
  const sock = getSocket();
  for (const c of recips) {
    let result = 'sent', error = null, waId = null;
    try {
      const sent = await sock.sendMessage(toJid(c.phone), { text: body });
      waId = sent?.key?.id ?? null;
      console.log(`[notify] ${kind} lead +${lead.whatsapp_number} → ${c.name} (${c.phone})`);
    } catch (err) {
      result = 'failed'; error = String(err.message).slice(0, 300);
      console.error(`[notify] failed → ${c.phone}: ${err.message}`);
    }
    await supabase.from('counselor_notifications').insert({
      lead_id: lead.id, counsellor_id: c.id ?? null, phone: c.phone, kind, result, error, wa_id: waId,
    });
  }
}

/**
 * Evaluate a lead and notify the counsellor when appropriate. Called after
 * meaningful flow progress. `reason: 'assistance'` forces a notification (the
 * student explicitly asked for a human).
 */
export async function checkAndNotify(leadId, { reason } = {}) {
  const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
  if (!lead || lead.opted_out) return;

  const temp = tempOf(lead.flow_status);
  if (lead.lead_temperature !== temp) await updateLeadFields(leadId, { lead_temperature: temp });

  const rose = RANK[temp] >= 1 && RANK[temp] > (RANK[lead.notified_temperature] ?? -1);
  const newCollege = !!lead.selected_college_id && lead.selected_college_id !== lead.notified_college_id;
  const explicit = reason === 'assistance';
  if (!rose && !newCollege && !explicit) return;

  const kind = explicit ? 'assistance' : newCollege && !rose ? 'college' : temp;
  await send(lead, kind, temp === 'Cold' ? 'Warm' : temp);
  await updateLeadFields(leadId, {
    notified_temperature: RANK[temp] >= 1 ? temp : lead.notified_temperature,
    notified_college_id: lead.selected_college_id ?? lead.notified_college_id,
    notified_at: new Date().toISOString(),
  });
}

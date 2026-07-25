// Single 8-hour, stage-specific no-reply follow-up.
//
// A lead stuck mid-flow gets exactly ONE reminder after 8h of inactivity,
// worded for the step they stopped at:
//   • no course           → generic nudge
//   • state pending       → spec message #3 (state)
//   • college pending     → spec message #3 (college)
//   • college chosen, app incomplete → spec message #4 (options 1–4)
// The 8h clock restarts whenever the student advances a step (sendMenu clears
// the reminder flags), so a fresh reminder can fire for the next stage. No
// second reminder for the same stage.
import { supabase } from '../db/supabase.js';
import { logMessage } from '../crm/messages.js';
import { getSocket, getWaState } from '../whatsapp/connection.js';
import { updateLeadFields } from '../crm/leads.js';
import * as C from './copy.js';
import * as cat from './catalog.js';
import { resendStep } from './engine.js';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const H8 = 8 * 60 * 60 * 1000;
const GAP_MS = 4000;
const INCOMPLETE_STEPS = ['awaiting_course', 'awaiting_other_course', 'awaiting_state', 'awaiting_other_state',
  'awaiting_college', 'awaiting_other_college', 'awaiting_action'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sends the stage-appropriate reminder; returns { resend, newStep }.
async function sendReminder(sock, jid, lead) {
  const courseName = (lead.selected_course_id ? (await cat.getCourse(lead.selected_course_id))?.name : lead.other_course) || 'your selected course';
  switch (lead.flow_step) {
    case 'awaiting_state':
    case 'awaiting_other_state':
      await sock.sendMessage(jid, { text: await C.reminderPending(lead, 'state', courseName) });
      return { resend: true };
    case 'awaiting_college':
    case 'awaiting_other_college':
      await sock.sendMessage(jid, { text: await C.reminderPending(lead, 'college', courseName) });
      return { resend: true };
    case 'awaiting_action': {
      const college = (lead.selected_college_id ? (await cat.getCollege(lead.selected_college_id))?.name : lead.other_college) || 'your selected college';
      await sock.sendMessage(jid, { text: C.reminderAppPending(lead, college) });
      return { resend: false, newStep: 'awaiting_app_choice' };
    }
    default:
      await sock.sendMessage(jid, { text: C.reminderCoursePending(lead) });
      return { resend: true };
  }
}

export async function runReminderSweep() {
  if (getWaState().status !== 'connected') return;
  const { data: leads, error } = await supabase.from('leads').select('*')
    .in('flow_step', INCOMPLETE_STEPS)
    .eq('needs_human', false).eq('opted_out', false).eq('automation_paused', false)
    .eq('reminder_8h_sent', false)
    .not('last_bot_message_at', 'is', null);
  if (error) { console.error('[reminders] query failed:', error.message); return; }
  if (!leads?.length) return;

  const now = Date.now();
  const sock = getSocket();
  for (const lead of leads) {
    if (now - new Date(lead.last_bot_message_at).getTime() < H8) continue;
    const jid = `${lead.whatsapp_number}@s.whatsapp.net`;
    try {
      const r = await sendReminder(sock, jid, lead);
      await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'bot', content: '[8h follow-up reminder sent]', messageType: 'system' });
      // One reminder per stage — set both flags so it never repeats for this step.
      await updateLeadFields(lead.id, { reminder_8h_sent: true, reminder_24h_sent: true, ...(r.newStep ? { flow_step: r.newStep } : {}) });
      if (r.resend) await resendStep(sock, jid, { ...lead, reminder_8h_sent: true }, { arm: false });
      console.log(`[reminders] 8h → +${lead.whatsapp_number} (${lead.flow_step})`);
      await sleep(GAP_MS);
    } catch (err) {
      console.error(`[reminders] failed for +${lead.whatsapp_number}: ${err.message}`);
    }
  }
}

export function startReminderScheduler() {
  setTimeout(runReminderSweep, 2 * 60 * 1000);
  setInterval(runReminderSweep, CHECK_INTERVAL_MS);
  console.log('[reminders] 8h stage-specific follow-up scheduler armed (15-min sweep)');
}

// Reminder & conversation-closure scheduler.
//
// Eligibility: only leads whose welcome was DELIVERED (lead_score ≥ 10). A lead
// with score 0 (never delivered) is never reminded.
//
// Timeline, measured from the bot's last question (last_bot_message_at, which
// resets whenever the student replies or advances a step):
//   +6h  → First reminder, stage-specific, if still stalled.
//   +24h → For low-engagement leads (score 10 or 20 = delivered / replied but no
//          course yet): Final reminder, then auto-close the conversation.
// Higher-score leads (course/state/college chosen) get the 6h reminder only —
// they're warm/hot and handed to a counsellor rather than auto-closed.
//
// Reminders stop the moment the student replies/advances (clock + flags reset in
// menu.js), marks Not Interested, or the conversation is auto-closed. Runs in the
// background, no manual intervention.
import { supabase } from '../db/supabase.js';
import { logMessage } from '../crm/messages.js';
import { getSocket, getWaState } from '../whatsapp/connection.js';
import * as C from './copy.js';
import * as cat from './catalog.js';
import { resendStep } from './engine.js';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const H6 = 6 * 60 * 60 * 1000;
const H24 = 24 * 60 * 60 * 1000;
const GAP_MS = 4000;
const INCOMPLETE_STEPS = ['awaiting_course', 'awaiting_other_course', 'awaiting_state', 'awaiting_other_state',
  'awaiting_college', 'awaiting_other_college', 'awaiting_action'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Set reminder flags / closure WITHOUT touching last_active_at or the clock
// (updateLeadFields would move last_active_at; here we write directly).
const patch = (id, fields) => supabase.from('leads').update(fields).eq('id', id);

// Sends the stage-appropriate FIRST reminder; returns { resend, newStep }.
async function sendFirstReminder(sock, jid, lead) {
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
    default: // awaiting_course / other_course
      await sock.sendMessage(jid, { text: C.reminderCoursePending(lead) });
      return { resend: true };
  }
}

export async function runReminderSweep() {
  if (getWaState().status !== 'connected') return;
  const { data: leads, error } = await supabase.from('leads').select('*')
    .in('flow_step', INCOMPLETE_STEPS)
    .gte('lead_score', 10)                 // eligibility: welcome delivered
    .eq('needs_human', false).eq('opted_out', false).eq('automation_paused', false)
    .not('last_bot_message_at', 'is', null);
  if (error) { console.error('[reminders] query failed:', error.message); return; }
  if (!leads?.length) return;

  const now = Date.now();
  const sock = getSocket();
  for (const lead of leads) {
    const idle = now - new Date(lead.last_bot_message_at).getTime();
    const lowEngagement = lead.lead_score === 10 || lead.lead_score === 20;
    const jid = `${lead.whatsapp_number}@s.whatsapp.net`;
    try {
      // ── Final reminder + auto-close (low-engagement, 24h no reply) ──
      if (lowEngagement && idle >= H24 && !lead.reminder_24h_sent) {
        await sock.sendMessage(jid, { text: await C.reminderFinal(lead) });
        await resendStep(sock, jid, lead, { arm: false }); // the "menu below" the message refers to
        await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'bot', content: '[final reminder — conversation auto-closed]', messageType: 'system' });
        await patch(lead.id, {
          reminder_8h_sent: true, reminder_24h_sent: true,
          flow_step: 'closed', flow_status: 'Auto-Closed (No Response)',
        });
        console.log(`[reminders] final+close → +${lead.whatsapp_number}`);
        await sleep(GAP_MS);
        continue;
      }
      // ── First reminder (6h, once) ──
      if (idle >= H6 && !lead.reminder_8h_sent) {
        const r = await sendFirstReminder(sock, jid, lead);
        await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'bot', content: '[6h follow-up reminder]', messageType: 'system' });
        await patch(lead.id, { reminder_8h_sent: true, ...(r.newStep ? { flow_step: r.newStep } : {}) });
        if (r.resend) await resendStep(sock, jid, { ...lead, reminder_8h_sent: true }, { arm: false });
        console.log(`[reminders] 6h → +${lead.whatsapp_number} (${lead.flow_step})`);
        await sleep(GAP_MS);
      }
    } catch (err) {
      console.error(`[reminders] failed for +${lead.whatsapp_number}: ${err.message}`);
    }
  }
}

export function startReminderScheduler() {
  setTimeout(runReminderSweep, 2 * 60 * 1000);
  setInterval(runReminderSweep, CHECK_INTERVAL_MS);
  console.log('[reminders] 6h/24h reminder + auto-close scheduler armed (15-min sweep)');
}

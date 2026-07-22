// No-reply reminder sweep for the counselling flow.
//
// A lead stuck on any menu/prompt step gets ONE friendly reminder after 8h and
// ONE final reminder after 24h (measured from the original unanswered bot
// message — last_bot_message_at, which the 8h reminder deliberately does NOT
// reset). Both reminders re-display the exact step the student stopped at.
// Replying advances the flow and re-arms the clock, which cancels pending
// reminders. Sweep runs in-process (no external cron); the backend is a
// long-lived Railway process.
import { supabase } from '../db/supabase.js';
import { logMessage } from '../crm/messages.js';
import { getSocket, getWaState } from '../whatsapp/connection.js';
import { updateLeadFields } from '../crm/leads.js';
import { reminder8h, reminder24h } from './copy.js';
import { resendStep } from './engine.js';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;  // every 15 min
const H8 = 8 * 60 * 60 * 1000;
const H24 = 24 * 60 * 60 * 1000;
const GAP_MS = 4000;

const INCOMPLETE_STEPS = [
  'awaiting_course', 'awaiting_other_course', 'awaiting_state', 'awaiting_other_state',
  'awaiting_college', 'awaiting_other_college', 'awaiting_action',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runReminderSweep() {
  if (getWaState().status !== 'connected') return;

  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .in('flow_step', INCOMPLETE_STEPS)
    .eq('needs_human', false)
    .eq('opted_out', false)
    .eq('automation_paused', false)
    .not('last_bot_message_at', 'is', null);
  if (error) { console.error('[reminders] query failed:', error.message); return; }
  if (!leads?.length) return;

  const now = Date.now();
  const sock = getSocket();
  const jid = (n) => `${n}@s.whatsapp.net`;

  for (const lead of leads) {
    const age = now - new Date(lead.last_bot_message_at).getTime();
    try {
      if (age >= H24 && !lead.reminder_24h_sent) {
        const text = await reminder24h(lead);
        await sock.sendMessage(jid(lead.whatsapp_number), { text });
        await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'bot', content: text });
        await resendStep(sock, jid(lead.whatsapp_number), lead, { arm: false });
        await updateLeadFields(lead.id, { reminder_24h_sent: true, reminder_8h_sent: true });
        console.log(`[reminders] final (24h) → +${lead.whatsapp_number}`);
      } else if (age >= H8 && !lead.reminder_8h_sent) {
        const text = reminder8h(lead);
        await sock.sendMessage(jid(lead.whatsapp_number), { text });
        await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'bot', content: text });
        await resendStep(sock, jid(lead.whatsapp_number), lead, { arm: false });
        await updateLeadFields(lead.id, { reminder_8h_sent: true });
        console.log(`[reminders] first (8h) → +${lead.whatsapp_number}`);
      } else {
        continue;
      }
      await sleep(GAP_MS);
    } catch (err) {
      console.error(`[reminders] failed for +${lead.whatsapp_number}: ${err.message}`);
    }
  }
}

export function startReminderScheduler() {
  setTimeout(runReminderSweep, 2 * 60 * 1000); // first sweep 2 min after boot
  setInterval(runReminderSweep, CHECK_INTERVAL_MS);
  console.log('[reminders] counselling-flow reminder scheduler armed (15-min sweep)');
}

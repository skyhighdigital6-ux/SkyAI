// Auto follow-up scheduler.
//
// When a student asks to be contacted later ("contact me after 4 days", "call
// me tomorrow"), the flow engine stores follow_up_date on the lead. This
// scheduler wakes periodically (the backend is a persistent process — no cron
// needed), finds due leads and sends a friendly re-engagement message, then
// resumes the flow from where they left off. Replying before the date cancels
// the follow-up (handled in the flow engine).
import { supabase } from '../db/supabase.js';
import { logMessage } from '../crm/messages.js';
import { getSocket, getWaState } from '../whatsapp/connection.js';
import { nameOf } from '../flow/copy.js';
import { resendStep, startFlow } from '../flow/engine.js';

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // every 30 min
const GAP_MS = 4000;                       // stagger between due leads
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runFollowUpSweep() {
  if (getWaState().status !== 'connected') {
    console.log('[follow-up] WhatsApp not connected — sweep skipped');
    return;
  }
  const { data: due, error } = await supabase
    .from('leads')
    .select('*')
    .lte('follow_up_date', new Date().toISOString())
    .eq('follow_up_sent', false)
    .eq('needs_human', false)
    .eq('opted_out', false)
    .eq('automation_paused', false)
    .not('follow_up_date', 'is', null);
  if (error) { console.error('[follow-up] query failed:', error.message); return; }
  if (!due?.length) return;

  console.log(`[follow-up] ${due.length} lead(s) due for re-engagement`);
  const sock = getSocket();
  for (const lead of due) {
    const jid = `${lead.whatsapp_number}@s.whatsapp.net`;
    try {
      const msg = `Hi ${nameOf(lead)}! 👋 Following up as promised from SkyHigh Educational Services — ` +
        `shall we continue with your admission guidance?`;
      await sock.sendMessage(jid, { text: msg });
      await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'bot', content: msg });
      // Mark sent up front so a slow resume can't double-fire the follow-up.
      await supabase.from('leads')
        .update({ follow_up_sent: true, last_active_at: new Date().toISOString() })
        .eq('id', lead.id);
      // Resume the flow: re-show their step, or start fresh if they never began.
      const l = { ...lead, follow_up_sent: true };
      if (lead.flow_step && lead.flow_step.startsWith('awaiting')) await resendStep(sock, jid, l);
      else await startFlow(sock, jid, l);
      console.log(`[follow-up] ✅ sent to +${lead.whatsapp_number}`);
    } catch (err) {
      console.error(`[follow-up] failed for +${lead.whatsapp_number}: ${err.message}`);
    }
    await sleep(GAP_MS);
  }
}

export function startFollowUpScheduler() {
  // First sweep shortly after boot (gives WhatsApp time to connect), then every 30 min.
  setTimeout(runFollowUpSweep, 90 * 1000);
  setInterval(runFollowUpSweep, CHECK_INTERVAL_MS);
  console.log('[follow-up] scheduler armed (30-min sweep)');
}

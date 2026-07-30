// Reliable welcome-message queue.
//
// Bulk/manual lead imports mark new leads welcome_status='pending' in the DB
// (not an in-memory loop). This worker drains the queue in small staggered
// batches, so 300+ leads all get exactly one welcome even across restarts,
// with retries + recorded failure reasons. Delivery/read status is updated
// later from Baileys receipts (see connection.js).
import { supabase } from '../db/supabase.js';
import { logMessage } from '../crm/messages.js';
import { getSocket, getWaState } from '../whatsapp/connection.js';
import { updateLeadFields } from '../crm/leads.js';
import { bumpScore, ACTION } from '../crm/scoring.js';
import { cloudEnabled, sendTemplate } from '../whatsapp/cloudApi.js';
import * as C from '../flow/copy.js';
import { courseMenu, sendMenu } from '../flow/menu.js';
import { getActiveCourses } from '../flow/catalog.js';

const TICK_MS = 12 * 1000;
const BATCH = 4;            // per tick → naturally rate-limited
const GAP_MS = 4000;        // stagger between sends (avoid overloading WhatsApp)
const MAX_ATTEMPTS = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let running = false;        // prevent overlapping sweeps

export async function runWelcomeSweep() {
  // The welcome is business-initiated → it goes out over the official Cloud API
  // when configured (no ban risk, no Baileys session needed). Only fall back to
  // Baileys if the Cloud API isn't set up, and then only while it's connected.
  const useCloud = cloudEnabled();
  if (running || (!useCloud && getWaState().status !== 'connected')) return;
  running = true;
  try {
    const { data: leads, error } = await supabase.from('leads').select('*')
      .eq('welcome_status', 'pending')
      .is('flow_step', null)
      .eq('needs_human', false).eq('opted_out', false).eq('automation_paused', false)
      .lt('welcome_attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true }).limit(BATCH);
    if (error) { console.error('[welcome] query failed:', error.message); return; }
    if (!leads?.length) return;

    const sock = useCloud ? null : getSocket();
    const courses = useCloud ? null : courseMenu(await getActiveCourses());
    for (const lead of leads) {
      const jid = `${lead.whatsapp_number}@s.whatsapp.net`;
      const attempt = (lead.welcome_attempts || 0) + 1;
      try {
        let waId = null;
        let step;
        if (useCloud) {
          // Template send. No 24h window is open yet, so we CANNOT append the
          // course menu here — it goes out free-form on their first reply
          // (flow_step 'awaiting_start' below picks that up).
          waId = await sendTemplate(lead.whatsapp_number, { params: [C.nameOf(lead)] });
          await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'bot', content: C.welcome(lead) });
          step = 'awaiting_start';
        } else {
          const text = C.welcome(lead);
          const sent = await sock.sendMessage(jid, { text });
          waId = sent?.key?.id ?? null;
          await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'bot', content: text });
          await sendMenu(sock, jid, lead, C.coursePrompt, courses);
          step = 'awaiting_course';
        }
        await updateLeadFields(lead.id, {
          flow_step: step, flow_status: 'New Lead', unrecognized_count: 0,
          welcome_status: 'sent', welcome_attempts: attempt,
          welcome_wa_id: waId, welcomed_at: new Date().toISOString(), welcome_error: null,
        });
        await bumpScore(lead.id, ACTION.delivered); // welcome sent → score ≥ 10
        console.log(`[welcome] ✅ ${useCloud ? 'cloud' : 'baileys'} → +${lead.whatsapp_number}`);
      } catch (err) {
        await updateLeadFields(lead.id, {
          welcome_attempts: attempt, welcome_error: String(err.message).slice(0, 300),
          welcome_status: attempt >= MAX_ATTEMPTS ? 'failed' : 'pending',
        });
        console.error(`[welcome] ✗ +${lead.whatsapp_number} attempt ${attempt}: ${err.message}`);
      }
      await sleep(GAP_MS);
    }
  } finally {
    running = false;
  }
}

export function startWelcomeWorker() {
  setTimeout(runWelcomeSweep, 30 * 1000);
  setInterval(runWelcomeSweep, TICK_MS);
  console.log('[welcome] welcome-queue worker armed');
}

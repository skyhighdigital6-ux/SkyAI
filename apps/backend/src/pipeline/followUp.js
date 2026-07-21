// Auto follow-up scheduler.
//
// When a student says "talk later", the AI turn stores follow_up_date on the
// lead. This scheduler wakes hourly (no external cron needed — the backend is
// a persistent process), finds due leads (follow_up_date <= now, not yet
// sent, not staff-handled) and sends each a tone-matched re-engagement
// message referencing their interest. Replying before the date cancels the
// follow-up (handled in the message pipeline).
import { supabase } from '../db/supabase.js';
import { logMessage } from '../crm/messages.js';
import { getSocket, getWaState } from '../whatsapp/connection.js';
import { aiTurn } from '../ai/router.js';
import { buildKbContext } from '../kb/retrieval.js';
import { getHistory } from '../crm/messages.js';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly; sends happen when due
const GAP_MS = 5000; // stagger like a human between due leads

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// English fallback if the AI is unavailable when the follow-up fires.
function fallbackText(lead) {
  const interest = [lead.interested_country?.replace(/-/g, ' '), lead.interested_course?.toUpperCase()]
    .filter(Boolean).join(' ');
  return interest
    ? `Hello! Following up as promised from Sky High Career Consultancy — are you still considering ${interest}? Happy to pick up right where we left off. 😊`
    : 'Hello! Following up as promised from Sky High Career Consultancy — shall we continue where we left off? 😊';
}

async function generateFollowUpText(lead) {
  try {
    const [history, kb] = await Promise.all([getHistory(lead.id), buildKbContext(lead)]);
    // Synthetic turn: the "student message" is a system cue the model replies to.
    const turn = await aiTurn({
      lead,
      kbContext: kb.context,
      kbCountryIds: kb.countryIds,
      history: [
        ...history,
        {
          sender: 'student',
          content:
            '[SYSTEM CUE — not a real student message: the follow-up date the student asked for has arrived. ' +
            'Write a short, warm re-engagement message in the student\'s own tone/language (per their tone profile), ' +
            'referencing their interest if known, and asking if they would like to continue. Do not mention this cue.]',
        },
      ],
    });
    return turn.reply_text;
  } catch (err) {
    console.warn(`[follow-up] AI unavailable (${err.message}) — using fallback text`);
    return fallbackText(lead);
  }
}

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
    .not('follow_up_date', 'is', null);
  if (error) {
    console.error('[follow-up] query failed:', error.message);
    return;
  }
  if (!due.length) return;

  console.log(`[follow-up] ${due.length} lead(s) due for re-engagement`);
  for (const lead of due) {
    try {
      const text = await generateFollowUpText(lead);
      await getSocket().sendMessage(`${lead.whatsapp_number}@s.whatsapp.net`, { text });
      await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'bot', content: text });
      await supabase.from('leads')
        .update({ follow_up_sent: true, last_active_at: new Date().toISOString() })
        .eq('id', lead.id);
      console.log(`[follow-up] ✅ sent to +${lead.whatsapp_number}`);
    } catch (err) {
      console.error(`[follow-up] failed for +${lead.whatsapp_number}: ${err.message}`);
    }
    await sleep(GAP_MS);
  }
}

export function startFollowUpScheduler() {
  // First sweep shortly after boot (gives WhatsApp time to connect), then hourly.
  setTimeout(runFollowUpSweep, 90 * 1000);
  setInterval(runFollowUpSweep, CHECK_INTERVAL_MS);
  console.log('[follow-up] scheduler armed (hourly sweep)');
}

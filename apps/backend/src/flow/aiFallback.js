// Optional AI fallback for free-text the menu flow doesn't understand.
//
// The flow is deterministic; this only kicks in when a student types a genuine
// question instead of picking an option. It produces ONE short answer, then the
// engine re-shows the current menu. It is fully defensive: any failure (no API
// key, provider down, bad output) returns null and the engine falls back to the
// scripted "I couldn't understand that" path. Never throws into the flow.
import { config } from '../config.js';
import { aiTurn } from '../ai/router.js';
import { buildKbContext } from '../kb/retrieval.js';
import { getHistory } from '../crm/messages.js';

// On unless explicitly disabled; needs at least one provider key to do anything.
const ENABLED = process.env.FLOW_AI_FALLBACK !== '0' && !!(config.geminiApiKey || config.groqApiKey);

// Treat as a question worth answering: ends with "?", or a reasonably long
// free-text sentence (not a stray word/typo).
export function looksLikeQuestion(text) {
  const t = (text || '').trim();
  if (!t) return false;
  return t.endsWith('?') || t.split(/\s+/).length >= 4;
}

export async function answerFreeText(lead, text) {
  if (!ENABLED || !looksLikeQuestion(text)) return null;
  try {
    const [history, kb] = await Promise.all([getHistory(lead.id), buildKbContext(lead)]);
    const turn = await aiTurn({
      lead,
      kbContext: kb.context,
      kbCountryIds: kb.countryIds,
      history: [
        ...history,
        {
          sender: 'student',
          content:
            `${text}\n\n[SYSTEM: The student is in a menu-driven admission flow (course → state → ` +
            `college). Answer their question briefly and helpfully in 1–2 sentences. Do not invent ` +
            `college names, fees or facts. End by inviting them to continue selecting from the menu below.]`,
        },
      ],
    });
    const reply = (turn?.reply_text || '').trim();
    return reply || null;
  } catch (err) {
    console.warn(`[flow-ai] fallback unavailable: ${err.message}`);
    return null;
  }
}

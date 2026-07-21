// Provider routing + resilience:
//  - Gemini quota exhausted for the day → go straight to Groq (if configured)
//  - Gemini 429 or transient error → exponential-backoff retries; the caller's
//    onHold() fires once so the student gets a brief holding message
//  - retries exhausted → Groq as last resort (if configured)
//
// When GROQ_API_KEY is NOT configured, Gemini is the only provider, so we are
// far more patient with it (more retries, longer backoff, and we retry
// transient/network errors too) before surfacing the caller's failure path.
// This keeps a brief Gemini blip from immediately becoming a "brief delay"
// apology to the student.
import { geminiTurn, RateLimitError } from './gemini.js';
import { groqTurn } from './groq.js';
import { recordUsage, geminiExhausted } from './quota.js';
import { config } from '../config.js';

// With Groq available, fail over quickly. Without it, ride out longer blips.
const BACKOFF_WITH_GROQ = [1000, 2000, 4000, 8000];
const BACKOFF_NO_GROQ = [1000, 2000, 4000, 8000, 15000, 25000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function aiTurn(turnInput, { onHold } = {}) {
  const hasGroq = !!config.groqApiKey;
  const backoff = hasGroq ? BACKOFF_WITH_GROQ : BACKOFF_NO_GROQ;

  let quotaDone = false;
  try {
    quotaDone = await geminiExhausted();
  } catch (err) {
    console.warn('[ai] quota check failed, assuming Gemini available:', err.message);
  }

  if (!quotaDone) {
    let heldOnce = false;
    for (let attempt = 0; attempt <= backoff.length; attempt++) {
      try {
        const turn = await geminiTurn(turnInput);
        recordUsage('gemini'); // fire-and-forget
        return { ...turn, _provider: 'gemini' };
      } catch (err) {
        const rateLimited = err instanceof RateLimitError;
        // Always retry rate limits. When Gemini is our only provider, retry
        // transient errors (network blips, occasional 5xx/parse) too — there
        // is nothing to fall back to, so patience beats an instant apology.
        const canRetry = attempt < backoff.length && (rateLimited || !hasGroq);
        if (canRetry) {
          if (!heldOnce) {
            heldOnce = true;
            await onHold?.();
          }
          console.warn(
            `[ai] Gemini ${rateLimited ? '429' : 'error'} (${String(err.message).slice(0, 70)}) — ` +
            `retry ${attempt + 1}/${backoff.length} in ${backoff[attempt]}ms`
          );
          await sleep(backoff[attempt]);
          continue;
        }
        if (!hasGroq) {
          // No fallback provider — surface failure only after exhausting retries.
          console.error(`[ai] Gemini failed after ${backoff.length} retries, no Groq fallback: ${err.message}`);
          throw err;
        }
        console.error(`[ai] Gemini failed (${err.message}) — falling back to Groq`);
        break;
      }
    }
  } else if (!hasGroq) {
    // Daily quota reportedly exhausted and no Groq — try Gemini anyway rather
    // than surface an apology blind; the counter can drift and per-key limits
    // may have reset. One attempt; if it throws, the caller handles it.
    const turn = await geminiTurn(turnInput);
    recordUsage('gemini');
    return { ...turn, _provider: 'gemini' };
  } else {
    console.warn('[ai] Gemini daily quota exhausted — routing to Groq');
  }

  const turn = await groqTurn(turnInput);
  recordUsage('groq');
  return { ...turn, _provider: 'groq' };
}

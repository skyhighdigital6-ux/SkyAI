// Lead scoring: apply Gemini's score_delta, clamp 0–100, derive temperature.
import { temperatureForScore } from 'shared/constants';
import { supabase } from '../db/supabase.js';

export function applyScoreDelta(currentScore, delta) {
  const lead_score = Math.max(0, Math.min(100, Math.round(currentScore + (delta || 0))));
  return { lead_score, lead_temperature: temperatureForScore(lead_score) };
}

// ── Deterministic action-based scoring ───────────────────────────────
// Each action maps to a fixed score; the lead keeps the HIGHEST it reaches
// (engagement only moves forward). Temperature is derived from that score.
//   delivered 10 · replied 20 · course 30 · state 50 · college 70
export const ACTION = { delivered: 10, replied: 20, course: 30, state: 50, college: 70 };
export const tempForScore = (s) => (s >= 70 ? 'Hot' : s >= 30 ? 'Warm' : 'Cold');

// Raise a lead's score to at least `minScore` (no-op if already higher).
export async function bumpScore(leadId, minScore) {
  const { data: lead } = await supabase.from('leads').select('lead_score').eq('id', leadId).maybeSingle();
  if (!lead) return;
  const cur = lead.lead_score ?? 0;
  const next = Math.max(cur, minScore);
  if (next !== cur) {
    await supabase.from('leads').update({ lead_score: next, lead_temperature: tempForScore(next) }).eq('id', leadId);
  }
}

// Student sent a message → refresh last-active and ensure score ≥ replied (20),
// in a single write (curScore is the value already loaded for the lead).
export async function markReplied(leadId, curScore) {
  const next = Math.max(curScore ?? 0, ACTION.replied);
  await supabase.from('leads').update({
    last_active_at: new Date().toISOString(),
    lead_score: next,
    lead_temperature: tempForScore(next),
  }).eq('id', leadId);
}

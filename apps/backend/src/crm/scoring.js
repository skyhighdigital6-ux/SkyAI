// Lead scoring: apply Gemini's score_delta, clamp 0–100, derive temperature.
import { temperatureForScore } from 'shared/constants';

export function applyScoreDelta(currentScore, delta) {
  const lead_score = Math.max(0, Math.min(100, Math.round(currentScore + (delta || 0))));
  return { lead_score, lead_temperature: temperatureForScore(lead_score) };
}

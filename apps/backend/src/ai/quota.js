// Daily AI provider counters in the ai_usage table — powers the dashboard
// quota banner (alert at 80%) and the automatic Gemini→Groq switch.
import { supabase } from '../db/supabase.js';
import { config } from '../config.js';

const today = () => new Date().toISOString().slice(0, 10);

export async function recordUsage(provider) {
  const column = provider === 'gemini' ? 'gemini_requests' : 'groq_requests';
  const day = today();
  // Read-then-upsert; a lost increment under race is acceptable at this scale.
  const { data: row } = await supabase.from('ai_usage').select('*').eq('day', day).maybeSingle();
  const { error } = await supabase.from('ai_usage').upsert({
    day,
    gemini_requests: row?.gemini_requests ?? 0,
    groq_requests: row?.groq_requests ?? 0,
    [column]: (row?.[column] ?? 0) + 1,
  });
  if (error) console.error('[quota] record failed:', error.message);
}

export async function getUsage() {
  const { data: row } = await supabase.from('ai_usage').select('*').eq('day', today()).maybeSingle();
  const used = row?.gemini_requests ?? 0;
  return {
    day: today(),
    gemini_requests: used,
    groq_requests: row?.groq_requests ?? 0,
    gemini_daily_limit: config.geminiDailyLimit,
    gemini_pct: Math.round((used / config.geminiDailyLimit) * 100),
  };
}

export async function geminiExhausted() {
  const { gemini_requests, gemini_daily_limit } = await getUsage();
  return gemini_requests >= gemini_daily_limit;
}

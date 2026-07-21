// Central env-var loading. Fails loudly at startup if a required key is
// missing once the milestone that needs it is wired in.
//
// The .env lives at the monorepo ROOT (shared with the dashboard), so load
// it explicitly — process.cwd() is apps/backend when running npm scripts.
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
dotenv.config(); // also allow a local apps/backend/.env override if one exists

const required = (name, { optionalUntil } = {}) => {
  const value = process.env[name];
  if (!value && !optionalUntil) {
    throw new Error(`Missing required env var: ${name} (see .env.example)`);
  }
  if (!value && optionalUntil) {
    console.warn(`[config] ${name} not set — required from ${optionalUntil} onward`);
  }
  return value;
};

export const config = {
  port: Number(process.env.PORT) || 3001,

  geminiApiKey: required('GEMINI_API_KEY', { optionalUntil: 'Milestone 4' }),
  // gemini-2.5-flash (the spec's pick) is closed to new API projects; 3.5 is
  // the current free-tier flash. Override with GEMINI_MODEL if it moves again.
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  groqApiKey: required('GROQ_API_KEY', { optionalUntil: 'Milestone 10' }),

  supabaseUrl: required('SUPABASE_URL', { optionalUntil: 'Milestone 3' }),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY', { optionalUntil: 'Milestone 3' }),

  baileysSessionPath: process.env.BAILEYS_SESSION_PATH || './baileys_auth',

  // Free-tier gemini-2.5-flash daily request cap; dashboard alerts at 80%.
  geminiDailyLimit: Number(process.env.GEMINI_DAILY_LIMIT) || 250,
};

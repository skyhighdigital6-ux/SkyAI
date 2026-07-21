// Supabase client with the SERVICE ROLE key — backend only, never shipped
// to the browser. Bypasses RLS; the dashboard uses the anon key instead.
//
// Lazy proxy: the real client is created on first use, so the backend can
// still boot (e.g. Baileys-only testing) before Supabase creds are in .env.
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { config } from '../config.js';

let _client = null;

function client() {
  if (!_client) {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    }
    _client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false },
      // Node < 22 has no native WebSocket; hand realtime-js the ws package
      // (already a Baileys dependency) so client creation works everywhere.
      realtime: { transport: WebSocket },
    });
  }
  return _client;
}

export const supabase = new Proxy({}, {
  get(_target, prop) {
    const c = client();
    const value = c[prop];
    return typeof value === 'function' ? value.bind(c) : value;
  },
});

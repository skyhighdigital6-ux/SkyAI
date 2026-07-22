// WhatsApp session persistence (Milestone 12).
//
// Railway has no persistent disk, so the Baileys auth folder is lost on every
// redeploy/crash — forcing a QR re-scan. This backs the whole auth folder up to
// the private Supabase Storage bucket `wa-sessions` as a single JSON blob and
// restores it on a cold boot, so the linked device survives restarts.
//
// The backend uses the service-role key, which bypasses Storage RLS.
import { readdir, readFile, mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { supabase } from '../db/supabase.js';

const BUCKET = 'wa-sessions';
const OBJECT = 'session.json';   // { [filename]: fileContents } of the auth folder
let pending = null;

// Materialize the saved session into `dir`. Returns true if anything restored.
export async function restoreSession(dir) {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(OBJECT);
    if (error || !data) return false;
    const files = JSON.parse(await data.text());
    if (!files || typeof files !== 'object') return false;
    await mkdir(dir, { recursive: true });
    let n = 0;
    for (const [name, content] of Object.entries(files)) {
      if (name.includes('/') || name.includes('..') || typeof content !== 'string') continue; // guard traversal
      await writeFile(join(dir, name), content, 'utf8');
      n += 1;
    }
    if (n) console.log(`[wa-session] restored ${n} file(s) from Supabase`);
    return n > 0;
  } catch (err) {
    console.warn('[wa-session] restore failed:', err.message);
    return false;
  }
}

async function uploadNow(dir) {
  try {
    if (!existsSync(dir)) return;
    const names = await readdir(dir);
    const files = {};
    for (const name of names) {
      try { files[name] = await readFile(join(dir, name), 'utf8'); } catch { /* skip unreadable */ }
    }
    if (!Object.keys(files).length) return;
    const body = Buffer.from(JSON.stringify(files));
    const { error } = await supabase.storage.from(BUCKET).upload(OBJECT, body, {
      contentType: 'application/json', upsert: true,
    });
    if (error) console.warn('[wa-session] backup failed:', error.message);
    else console.log(`[wa-session] backed up ${Object.keys(files).length} file(s) to Supabase`);
  } catch (err) {
    console.warn('[wa-session] backup error:', err.message);
  }
}

// Debounced backup — coalesces the rapid creds.update bursts during pairing
// into a single upload. Pass { immediate: true } to flush now (e.g. on connect).
export function backupSession(dir, { immediate = false } = {}) {
  if (pending) { clearTimeout(pending); pending = null; }
  if (immediate) return uploadNow(dir);
  pending = setTimeout(() => { pending = null; uploadNow(dir); }, 3000);
}

// Remove the remote backup (on logout / disconnect) so a fresh pairing starts clean.
export async function clearRemoteSession() {
  try { await supabase.storage.from(BUCKET).remove([OBJECT]); }
  catch (err) { console.warn('[wa-session] clear failed:', err.message); }
}

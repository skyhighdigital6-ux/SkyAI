// Baileys socket lifecycle: QR pairing, persistent auth, auto-reconnect.
// Auth state lives at BAILEYS_SESSION_PATH (local folder for now; moves to
// Supabase Storage in Milestone 12 so Railway redeploys keep the session).
//
// Exposes live pairing state (status / number / current QR) for the
// dashboard's "Connect WhatsApp" page, plus a safe disconnect that unlinks
// the device and immediately starts a fresh pairing cycle.
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} from '@whiskeysockets/baileys';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';
import { config } from '../config.js';
import { onIncomingMessages } from './incoming.js';
import { restoreSession, backupSession, clearRemoteSession } from './sessionStore.js';
import { supabase } from '../db/supabase.js';
import { bumpScore, ACTION } from '../crm/scoring.js';

// Baileys ack levels: 3 = delivered to device, 4 = read, 5 = played.
// Map welcome-message receipts to the lead's welcome_status so admins see
// Sent → Delivered → Read. We only ever move the status forward.
const RANK = { pending: 0, sent: 1, delivered: 2, read: 3 };
async function onWelcomeReceipt(waId, ackStatus) {
  const next = ackStatus >= 4 ? 'read' : ackStatus >= 3 ? 'delivered' : null;
  if (!next || !waId) return;
  const { data: lead } = await supabase.from('leads')
    .select('id, welcome_status').eq('welcome_wa_id', waId).maybeSingle();
  if (!lead) return;
  if ((RANK[next] ?? 0) <= (RANK[lead.welcome_status] ?? 0)) return; // never go backwards
  await supabase.from('leads').update({ welcome_status: next }).eq('id', lead.id);
  await bumpScore(lead.id, ACTION.delivered); // message delivered → score ≥ 10
}

// Baileys is chatty; keep its internal logs quiet by default and do our own.
// Set BAILEYS_LOG_LEVEL=warn|info|debug to surface protocol/decrypt errors.
const baileysLogger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });

let sock = null;
let reconnectAttempts = 0;
let restarting = false;

// Live pairing state for the dashboard.
// status: 'starting' | 'waiting_qr' | 'connected' | 'reconnecting'
let waStatus = 'starting';
let waNumber = null;
let latestQr = null;

export function getSocket() {
  if (!sock) throw new Error('WhatsApp socket not connected yet');
  return sock;
}

export function getWaState() {
  return { status: waStatus, number: waNumber, qr: latestQr };
}

async function clearSession() {
  await rm(config.baileysSessionPath, { recursive: true, force: true });
  await clearRemoteSession();
}

// Restart guard — several code paths (logout, loggedOut close, errors) can
// ask for a restart; only one may actually run at a time.
async function restartWhatsApp({ wipeSession = false } = {}) {
  if (restarting) return;
  restarting = true;
  try {
    if (wipeSession) await clearSession();
    await startWhatsApp();
  } finally {
    restarting = false;
  }
}

// Dashboard "Disconnect" — unlink from the phone and start fresh pairing.
export async function disconnectWhatsApp() {
  waStatus = 'starting';
  waNumber = null;
  latestQr = null;
  const old = sock;
  sock = null;
  try {
    // Removes the linked device on the phone; also triggers a loggedOut
    // close on the old socket (ignored — we restart deliberately below).
    await old?.logout();
  } catch (err) {
    console.warn('[whatsapp] logout threw (already disconnected?):', err.message);
  }
  await restartWhatsApp({ wipeSession: true });
}

export async function startWhatsApp() {
  // Cold boot (fresh container, no local creds) → restore the session from
  // Supabase so a redeploy/crash doesn't force a re-scan. On in-process
  // reconnects the local folder already exists, so we keep the newer state.
  if (!existsSync(join(config.baileysSessionPath, 'creds.json'))) {
    await restoreSession(config.baileysSessionPath);
  }

  const { state, saveCreds } = await useMultiFileAuthState(config.baileysSessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const mySock = makeWASocket({
    version,
    auth: state,
    logger: baileysLogger,
    browser: Browsers.macOS('Desktop'),
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });
  sock = mySock;

  mySock.ev.on('creds.update', async () => {
    await saveCreds();
    backupSession(config.baileysSessionPath);   // debounced backup to Supabase
  });

  mySock.ev.on('connection.update', (update) => {
    // A replaced socket (after disconnect) must not fight the current one.
    if (sock !== mySock) return;

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      waStatus = 'waiting_qr';
      latestQr = qr;
      console.log('\n[whatsapp] Scan this QR from WhatsApp → Linked Devices:\n');
      qrcode.generate(qr, { small: true });
      // Headless pairing: also write the QR as a PNG when QR_IMAGE_PATH is set.
      if (process.env.QR_IMAGE_PATH) {
        QRCode.toFile(process.env.QR_IMAGE_PATH, qr, { width: 512, margin: 2 })
          .then(() => console.log(`[whatsapp] QR image written: ${process.env.QR_IMAGE_PATH}`))
          .catch((err) => console.error('[whatsapp] QR image write failed:', err.message));
      }
    }

    if (connection === 'open') {
      reconnectAttempts = 0;
      const me = mySock.user?.id?.split(':')[0];
      waStatus = 'connected';
      waNumber = me ?? null;
      latestQr = null;
      console.log(`[whatsapp] Connected ✅ as +${me}`);
      backupSession(config.baileysSessionPath, { immediate: true }); // persist right after (re)connect
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        // Unlinked from the phone — wipe the dead session and go straight
        // back to pairing so the dashboard shows a fresh QR.
        console.warn('[whatsapp] Logged out from the phone — starting fresh pairing.');
        waStatus = 'starting';
        waNumber = null;
        latestQr = null;
        restartWhatsApp({ wipeSession: true });
        return;
      }

      // Any other close (network drop, restartRequired after pairing, etc.)
      // → reconnect with capped backoff.
      reconnectAttempts += 1;
      waStatus = 'reconnecting';
      const delayMs = Math.min(1000 * 2 ** reconnectAttempts, 30_000);
      console.warn(
        `[whatsapp] Connection closed (code ${statusCode ?? 'unknown'}) — reconnecting in ${delayMs / 1000}s…`
      );
      setTimeout(() => restartWhatsApp(), delayMs);
    }
  });

  mySock.ev.on('messages.upsert', (upsert) => onIncomingMessages(mySock, upsert));

  // Delivery/read receipts → update welcome_status for the matching lead.
  mySock.ev.on('messages.update', (updates) => {
    for (const u of updates) {
      const ack = u?.update?.status;
      if (typeof ack === 'number') onWelcomeReceipt(u.key?.id, ack).catch(() => {});
    }
  });

  return mySock;
}

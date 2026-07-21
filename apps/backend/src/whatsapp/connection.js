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
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';
import { config } from '../config.js';
import { onIncomingMessages } from './incoming.js';

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

  mySock.ev.on('creds.update', saveCreds);

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

  return mySock;
}

// Incoming-message listener — extracts text and forwards each message into
// the pipeline orchestrator.
import { enqueueMessage } from '../pipeline/handleMessage.js';

// Pull the human-readable text out of Baileys' many message shapes.
export function extractText(message) {
  if (!message) return null;
  // Some messages arrive wrapped (ephemeral / viewOnce)
  const inner =
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message;

  return (
    inner.conversation ||
    inner.extendedTextMessage?.text ||
    inner.imageMessage?.caption ||
    inner.videoMessage?.caption ||
    inner.documentMessage?.caption ||
    // Button / list replies (Milestone 9) carry their selection here
    inner.buttonsResponseMessage?.selectedButtonId ||
    inner.listResponseMessage?.singleSelectReply?.selectedRowId ||
    inner.templateButtonReplyMessage?.selectedId ||
    null
  );
}

export function onIncomingMessages(sock, { type, messages }) {
  // 'notify' = genuinely new messages; 'append'/history syncs are ignored.
  if (type !== 'notify') return;

  for (const msg of messages) {
    const jid = msg.key.remoteJid;

    if (msg.key.fromMe) continue;                    // our own outgoing messages
    if (!jid || jid === 'status@broadcast') continue; // status updates
    if (jid.endsWith('@g.us')) continue;             // group chats — bot is 1:1 only
    // 1:1 chats arrive as classic @s.whatsapp.net OR privacy-preserving @lid
    // (WhatsApp's newer addressing). Anything else (newsletters, broadcast
    // lists) is skipped.
    const isLid = jid.endsWith('@lid');
    if (!jid.endsWith('@s.whatsapp.net') && !isLid) continue;

    // For @lid chats Baileys v7 exposes the real phone-number JID alongside
    // (remoteJidAlt / senderPn). Fall back to the LID digits so the lead is
    // still tracked even if the mapping is missing.
    const pnJid = isLid ? (msg.key.remoteJidAlt || msg.key.senderPn || null) : jid;
    if (isLid && !pnJid) {
      console.warn(`[incoming] ${jid}: no phone-number mapping yet — using LID digits`);
    }
    const number = (pnJid || jid).split('@')[0].split(':')[0];
    const name = msg.pushName || 'unknown';
    const text = extractText(msg.message);

    if (text) {
      console.log(`[incoming] +${number} (${name}): ${text}`);
      enqueueMessage({ sock, jid, number, name, text, raw: msg });
    } else {
      const kind = Object.keys(msg.message || {})[0] || 'unknown';
      console.log(`[incoming] +${number} (${name}): <non-text message: ${kind}> — ignored`);
    }
  }
}

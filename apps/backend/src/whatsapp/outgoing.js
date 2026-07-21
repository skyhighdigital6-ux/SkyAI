// Sending replies like a human types on WhatsApp:
//  - split long reply_text into 2–3 shorter messages (never one giant paragraph)
//  - show "typing…" presence with a 1–2s delay before each part
const MAX_PARTS = 3;
const LONG_MESSAGE = 220; // chars — beyond this a single block gets sentence-split

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Split text into 1–3 WhatsApp-sized parts. Prefers the model's own \n\n
// split points; falls back to sentence grouping for one long block.
export function splitReply(text) {
  let parts = text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

  if (parts.length === 1 && parts[0].length > LONG_MESSAGE) {
    const sentences = parts[0].match(/[^.!?…]+[.!?…]+["']?\s*|[^.!?…]+$/g) ?? [parts[0]];
    const target = Math.min(Math.ceil(parts[0].length / LONG_MESSAGE), MAX_PARTS);
    const perPart = Math.ceil(sentences.length / target);
    parts = [];
    for (let i = 0; i < sentences.length; i += perPart) {
      parts.push(sentences.slice(i, i + perPart).join('').trim());
    }
  }

  // Too many blocks → merge the tail so we never exceed MAX_PARTS.
  if (parts.length > MAX_PARTS) {
    parts = [...parts.slice(0, MAX_PARTS - 1), parts.slice(MAX_PARTS - 1).join('\n\n')];
  }

  return parts.filter(Boolean);
}

// Typing delay roughly proportional to message length, clamped to 1–2s.
const typingDelay = (part) => Math.min(2000, Math.max(1000, part.length * 12));

/**
 * Send a reply as 1–3 messages with typing presence between them.
 * Returns the sent parts (for transcript logging).
 */
export async function sendReply(sock, jid, replyText) {
  const parts = splitReply(replyText);

  for (const part of parts) {
    await sock.sendPresenceUpdate('composing', jid);
    await sleep(typingDelay(part));
    await sock.sendMessage(jid, { text: part });
  }
  await sock.sendPresenceUpdate('paused', jid);

  return parts;
}

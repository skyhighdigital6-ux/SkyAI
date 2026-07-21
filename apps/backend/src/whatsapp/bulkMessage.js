// Bulk Message — send one template (text + optional media + optional
// quick-reply buttons) to many leads, safely.
//
// WhatsApp does not allow true simultaneous mass-sending (and bans numbers
// that try), so sends run sequentially, staggered ~4s apart: at 10:12:02
// lead 1 is messaged, at 10:12:06 lead 2, and so on. Up to 200 recipients
// per run. One run at a time; progress is kept in memory and polled by the
// dashboard. Every sent message is logged into the lead's transcript.
//
// Audience: either a filter (temperature / stage / interested country) or an
// explicit list of lead ids picked with checkboxes in the dashboard.
import { supabase } from '../db/supabase.js';
import { logMessage } from '../crm/messages.js';
import { getSocket } from './connection.js';

const MAX_RECIPIENTS = 200;
const MAX_MEDIA_BYTES = 16 * 1024 * 1024; // WhatsApp's practical media cap
const DELAY_MIN_MS = 4000; // ~4s stagger between users
const DELAY_MAX_MS = 6000; // small jitter so the pattern isn't robotic

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const staggerDelay = () =>
  sleep(DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS)));

const idle = {
  running: false, total: 0, sent: 0, failed: 0, capped: false,
  text: null, mediaName: null, startedAt: null, finishedAt: null,
};
let job = { ...idle };

export function getBulkStatus() {
  return { ...job };
}

// filter: { temperature?, stage?, country?, leadIds?: string[] }
// Escalated/human-handled leads are always excluded — staff owns those chats.
async function selectRecipients(filter = {}) {
  let q = supabase.from('leads')
    .select('id, whatsapp_number, name')
    .eq('needs_human', false)
    .order('lead_score', { ascending: false }); // cap keeps the hottest leads
  if (filter.leadIds?.length) {
    q = q.in('id', filter.leadIds);
  } else {
    if (filter.temperature) q = q.eq('lead_temperature', filter.temperature);
    if (filter.stage) q = q.eq('current_stage', filter.stage);
    if (filter.country) q = q.eq('interested_country', filter.country);
  }
  const { data, error } = await q;
  if (error) throw new Error(`recipient query failed: ${error.message}`);
  return data ?? [];
}

export async function countRecipients(filter) {
  const all = (await selectRecipients(filter)).length;
  return { count: Math.min(all, MAX_RECIPIENTS), matching: all, max: MAX_RECIPIENTS };
}

// media: { kind: 'image'|'video'|'pdf', base64, mimetype, fileName }
function buildMediaMessage(media, caption) {
  const buffer = Buffer.from(media.base64, 'base64');
  if (buffer.length > MAX_MEDIA_BYTES) throw new Error('media exceeds 16 MB limit');
  if (media.kind === 'image') return { image: buffer, caption };
  if (media.kind === 'video') return { video: buffer, caption };
  return {
    document: buffer,
    mimetype: media.mimetype || 'application/pdf',
    fileName: media.fileName || 'document.pdf',
    caption,
  };
}

// Buttons are typed and actionable:
//   { type: 'reply', label }            → tap sends the label back as text
//   { type: 'call',  label, value }     → tap opens the dialer on that number
//   { type: 'url',   label, value }     → tap opens the link
// Reply-button ids ARE the labels, so a tap flows through the normal AI
// pipeline like the student typed it.
const digits = (v) => String(v ?? '').replace(/[^\d]/g, '');

export function normalizeButtons(buttons) {
  return (buttons ?? [])
    .map((b) => ({
      type: ['call', 'url'].includes(b?.type) ? b.type : 'reply',
      label: String(b?.label ?? '').trim(),
      value: String(b?.value ?? '').trim(),
    }))
    .filter((b) => b.label)
    .slice(0, 3)
    .map((b) => {
      if (b.type === 'call' && !digits(b.value)) throw new Error(`call button "${b.label}" needs a phone number`);
      if (b.type === 'url' && !/^https?:\/\//i.test(b.value)) throw new Error(`link button "${b.label}" needs a full URL (https://…)`);
      return b;
    });
}

// WhatsApp silently strips real interactive buttons from unofficial senders
// (the message "sends" fine but phones render only the body text). So options
// are delivered as smart text instead — WhatsApp auto-links phone numbers and
// URLs, so Call/Link options stay tappable, and Reply options are numbered
// for the student to answer ("1", "2", …), which the AI reads from context.
export function buttonLines(buttons) {
  let n = 0;
  return buttons.map((b) => {
    if (b.type === 'call') return `📞 ${b.label}: +${digits(b.value)}`;
    if (b.type === 'url') return `🔗 ${b.label}: ${b.value}`;
    n += 1;
    return `${n}️⃣ ${b.label} — reply *${n}*`;
  }).join('\n');
}

// One recipient: media (with the text as caption) → options → plain text.
async function sendTemplate(jid, { text, media, buttons }) {
  const sock = getSocket();
  const options = buttons?.length ? buttonLines(buttons) : null;

  if (media) {
    await sock.sendMessage(jid, buildMediaMessage(media, text || undefined));
    if (options) await sock.sendMessage(jid, { text: options });
  } else {
    const body = [text, options].filter(Boolean).join('\n\n');
    if (body) await sock.sendMessage(jid, { text: body });
  }
}

export async function startBulkMessage({ text, media, buttons, filter, staffName }) {
  if (job.running) throw new Error('A bulk message is already running');
  const cleanText = text?.trim() || null;
  const cleanButtons = normalizeButtons(buttons);
  if (!cleanText && !media) throw new Error('text or media required');
  if (media?.base64 && Buffer.from(media.base64, 'base64').length > MAX_MEDIA_BYTES) {
    throw new Error('media exceeds 16 MB limit');
  }

  const matching = await selectRecipients(filter);
  if (matching.length === 0) throw new Error('No leads match this audience');
  const recipients = matching.slice(0, MAX_RECIPIENTS);

  job = {
    running: true, total: recipients.length, sent: 0, failed: 0,
    capped: matching.length > MAX_RECIPIENTS,
    text: cleanText, mediaName: media?.fileName ?? null,
    startedAt: new Date().toISOString(), finishedAt: null,
  };
  console.log(`[bulk] ${staffName ?? 'staff'} → ${recipients.length} leads` +
    (job.capped ? ` (capped from ${matching.length})` : '') +
    (media ? ` [${media.kind}: ${media.fileName}]` : '') +
    (cleanButtons.length ? ` [buttons: ${cleanButtons.map((b) => b.label).join(' | ')}]` : '') +
    `: "${(cleanText ?? '').slice(0, 60)}"`);

  const transcriptLine = [
    cleanText,
    media ? `[sent ${media.kind}: ${media.fileName ?? 'attachment'}]` : null,
    cleanButtons.length ? `[options: ${cleanButtons.map((b) => b.label).join(' | ')}]` : null,
  ].filter(Boolean).join('\n');

  // Fire-and-forget: the HTTP request returns immediately; the dashboard
  // polls getBulkStatus() for progress.
  (async () => {
    for (const lead of recipients) {
      try {
        const jid = `${lead.whatsapp_number}@s.whatsapp.net`;
        await sendTemplate(jid, { text: cleanText, media, buttons: cleanButtons });
        await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'staff', content: transcriptLine });
        job.sent += 1;
      } catch (err) {
        job.failed += 1;
        console.error(`[bulk] failed for +${lead.whatsapp_number}: ${err.message}`);
      }
      await staggerDelay();
    }
    job.running = false;
    job.finishedAt = new Date().toISOString();
    console.log(`[bulk] Done — ${job.sent} sent, ${job.failed} failed of ${job.total}`);
  })();

  return getBulkStatus();
}

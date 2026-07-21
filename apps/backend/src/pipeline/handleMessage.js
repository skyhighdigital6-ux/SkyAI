// THE orchestrator. One incoming WhatsApp message flows through:
//   per-JID queue → lead lookup → transcript log → human-pause check →
//   privacy disclosure → button-choice mapping → KB context → AI turn →
//   CRM update → reply (split + typing delays) → buttons → brochure.
import { CHOICE_OPTIONS, CHOICE_FIELD } from 'shared/constants';
import { findOrCreateLead, applyTurn, updateLeadFields } from '../crm/leads.js';
import { logMessage, getHistory } from '../crm/messages.js';
import { buildKbContext } from '../kb/retrieval.js';
import { aiTurn } from '../ai/router.js';
import { sendReply } from '../whatsapp/outgoing.js';
import { sendChoiceButtons, parseChoiceReply } from '../whatsapp/buttons.js';
import { maybeSendBrochure } from '../whatsapp/media.js';
import { getOrCreatePdf } from '../pdf/generate.js';

const DISCLOSURE =
  'A quick note: your NEET, academic and budget details are stored only to ' +
  'provide you accurate guidance and are never shared with any third party. 🔒';

const HOLDING_MESSAGE = 'One moment please — let me check that for you.';

// Sent when every AI provider fails (rate limits, outage) so the student is
// never left on read; the message stays in the transcript for staff follow-up.
const AI_DOWN_MESSAGE =
  'Thank you for your message. We are experiencing a brief delay — ' +
  'a detailed reply will follow shortly.';

// One message at a time per student — a fast double-text must not run two
// AI turns in parallel on the same lead.
const queues = new Map();

export function enqueueMessage(ctx) {
  const prev = queues.get(ctx.jid) ?? Promise.resolve();
  const next = prev.then(() => processMessage(ctx)).catch((err) => {
    console.error(`[pipeline] failed for ${ctx.jid}:`, err);
  });
  queues.set(ctx.jid, next);
  return next;
}

async function processMessage({ sock, jid, number, name, text, raw }) {
  let lead = await findOrCreateLead(number, name);

  const choice = parseChoiceReply(text);
  await logMessage({
    leadId: lead.id,
    direction: 'inbound',
    sender: 'student',
    content: choice
      ? `Selected ${choice.kind}: ${CHOICE_OPTIONS[choice.kind]?.find((o) => o.id === choice.id)?.label ?? choice.id}`
      : text,
    messageType: choice ? 'button_reply' : 'text',
    waMessageId: raw?.key?.id ?? null,
  });

  // Escalated / taken-over lead → bot stays silent, staff replies from dashboard.
  if (lead.needs_human) {
    console.log(`[pipeline] +${number} needs_human — bot paused, message logged only`);
    return;
  }

  // Button tap → write the field directly (clean data, no AI parsing needed).
  if (choice && CHOICE_FIELD[choice.kind]) {
    lead = await updateLeadFields(lead.id, { [CHOICE_FIELD[choice.kind]]: choice.id });
  }

  // Student came back on their own → cancel any pending scheduled follow-up.
  if (lead.follow_up_date && !lead.follow_up_sent) {
    lead = await updateLeadFields(lead.id, { follow_up_date: null, follow_up_sent: false });
    console.log(`[pipeline] +${number} replied — pending follow-up cancelled`);
  }

  // One-time privacy disclosure, early in every new conversation.
  if (!lead.disclosure_sent) {
    await sock.sendMessage(jid, { text: DISCLOSURE });
    await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'bot', content: DISCLOSURE, messageType: 'system' });
    lead = await updateLeadFields(lead.id, { disclosure_sent: true });
  }

  const [history, kb] = await Promise.all([getHistory(lead.id), buildKbContext(lead)]);

  let turn;
  try {
    turn = await aiTurn(
      { lead, kbContext: kb.context, kbCountryIds: kb.countryIds, history },
      {
        onHold: async () => {
          await sock.sendMessage(jid, { text: HOLDING_MESSAGE });
          await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'bot', content: HOLDING_MESSAGE, messageType: 'system' });
        },
      }
    );
  } catch (err) {
    // Both providers down — apologize instead of going silent, keep the lead alive.
    console.error(`[pipeline] AI unavailable for +${number}: ${err.message}`);
    await sock.sendMessage(jid, { text: AI_DOWN_MESSAGE });
    await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'bot', content: AI_DOWN_MESSAGE, messageType: 'system' });
    await updateLeadFields(lead.id, {});  // bumps last_active_at for the dashboard
    return;
  }

  lead = await applyTurn(lead, turn);

  const parts = await sendReply(sock, jid, turn.reply_text);
  for (const part of parts) {
    await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'bot', content: part });
  }

  if (turn.escalate) {
    // applyTurn already set needs_human + stage; reply_text was the holding message.
    console.log(`[pipeline] 🚨 +${number} escalated to human — bot paused`);
    return;
  }

  if (turn.send_buttons && CHOICE_OPTIONS[turn.send_buttons]) {
    await sendChoiceButtons(sock, jid, turn.send_buttons);
    await logMessage({
      leadId: lead.id, direction: 'outbound', sender: 'bot',
      content: `[offered ${turn.send_buttons} options]`, messageType: 'buttons',
    });
  }

  const sentPdf = await maybeSendBrochure(sock, jid, lead);
  if (sentPdf) {
    await logMessage({
      leadId: lead.id, direction: 'outbound', sender: 'bot',
      content: `[sent PDF: ${sentPdf}]`, messageType: 'pdf',
    });
  }

  // Dynamic PDF (Feature 4.1): built on demand from the KB, cached in Storage.
  // pdf_content_type isn't in Gemini's `required` list, so the model can
  // legitimately set pdf_requested=true and still omit it — default to
  // country_overview rather than silently dropping the PDF the student asked for.
  if (turn.pdf_requested) {
    try {
      const pdf = await getOrCreatePdf({
        contentType: turn.pdf_content_type || 'country_overview',
        topic: turn.pdf_topic || lead.interested_country || '',
      });
      await sock.sendMessage(jid, {
        document: pdf.buffer, mimetype: 'application/pdf', fileName: pdf.fileName,
      });
      lead = await updateLeadFields(lead.id, {
        documents_shared: [
          ...(lead.documents_shared || []),
          { doc: pdf.storagePath, type: turn.pdf_content_type, topic: turn.pdf_topic ?? null, sent_at: new Date().toISOString() },
        ],
      });
      await logMessage({
        leadId: lead.id, direction: 'outbound', sender: 'bot',
        content: `[sent generated PDF: ${pdf.fileName}${pdf.cached ? ' (cached)' : ''}]`, messageType: 'pdf',
      });
      console.log(`[pdf] Sent ${pdf.fileName} to +${number}${pdf.cached ? ' (from cache)' : ''}`);
    } catch (err) {
      console.error(`[pdf] generation failed for +${number}: ${err.message}`);
    }
  }
}

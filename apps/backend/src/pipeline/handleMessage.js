// THE orchestrator. One incoming WhatsApp message flows through:
//   per-JID queue → duplicate guard → lead lookup → entry-source capture →
//   transcript log → human-pause check → deterministic counselling flow.
//
// The conversation itself is the menu state machine in ../flow/engine.js
// (Course → State → College → documents → expert handover). Free-text the flow
// can't parse is answered best-effort by the AI fallback inside the engine.
import { supabase } from '../db/supabase.js';
import { findOrCreateLead, updateLeadFields } from '../crm/leads.js';
import { logMessage } from '../crm/messages.js';
import { handleFlowMessage } from '../flow/engine.js';

// The Google Business Profile "chat" button pre-fills a message like
// "Hi, I need help with college admission" — used only to tag the source.
const GBP_HINT = /help.*(admission|college)|college admission|need help with (a )?college/i;

// One message at a time per student — a fast double-text must not run two
// flow turns in parallel on the same lead.
const queues = new Map();

export function enqueueMessage(ctx) {
  const prev = queues.get(ctx.jid) ?? Promise.resolve();
  const next = prev.then(() => processMessage(ctx)).catch((err) => {
    console.error(`[pipeline] failed for ${ctx.jid}:`, err);
  });
  queues.set(ctx.jid, next);
  return next;
}

// Idempotency: WhatsApp/Baileys can redeliver the same message id. Inserting
// into processed_wa_messages fails with a unique violation the second time.
async function alreadyProcessed(waId) {
  if (!waId) return false;
  const { error } = await supabase.from('processed_wa_messages').insert({ wa_message_id: waId });
  return error?.code === '23505'; // duplicate key → seen before
}

async function processMessage({ sock, jid, number, name, text, raw }) {
  const waId = raw?.key?.id ?? null;
  if (await alreadyProcessed(waId)) {
    console.log(`[pipeline] duplicate message ${waId} — ignored`);
    return;
  }

  let lead = await findOrCreateLead(number, name);

  // Fill in the WhatsApp profile name if we still don't have one saved.
  if ((!lead.name || lead.name === 'unknown') && name && name !== 'unknown') {
    lead = await updateLeadFields(lead.id, { name });
  }
  // Record where the student came from, once.
  if (!lead.entry_source) {
    const source = GBP_HINT.test(text || '') ? 'Google Business Profile' : 'WhatsApp';
    lead = await updateLeadFields(lead.id, { entry_source: source });
  }

  await logMessage({
    leadId: lead.id, direction: 'inbound', sender: 'student',
    content: text, messageType: 'text', waMessageId: waId,
  });

  // Human took over (handover / callback / admin) → bot stays silent.
  if (lead.needs_human) {
    console.log(`[pipeline] +${number} needs_human — bot paused, message logged only`);
    return;
  }

  try {
    await handleFlowMessage({ sock, jid, number, name, text, raw }, lead);
  } catch (err) {
    console.error(`[pipeline] flow error for +${number}:`, err);
  }
}

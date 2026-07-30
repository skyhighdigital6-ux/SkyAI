// Inbound webhook for the official WhatsApp Cloud API.
//
// Students welcomed via the Cloud API reply to THAT number, so their messages
// arrive here (Meta POSTs them) rather than through the Baileys socket. Each
// one is fed into the same pipeline/flow engine, with a Cloud-backed transport
// so the bot's replies go back out over the official API — which is allowed
// free-form for 24h after the student's last message.
//
// Meta also POSTs delivery/read statuses here; those update welcome_status and
// the lead score exactly like the Baileys receipts do.
import express from 'express';
import { supabase } from '../db/supabase.js';
import { enqueueMessage } from '../pipeline/handleMessage.js';
import { bumpScore, ACTION } from '../crm/scoring.js';
import { cloudSock } from './cloudApi.js';

export const cloudWebhook = express.Router();

// Meta's one-time subscription handshake.
cloudWebhook.get('/', (req, res) => {
  const verify = process.env.WA_WEBHOOK_VERIFY_TOKEN;
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verify) {
    console.log('[cloud] webhook verified');
    return res.status(200).send(req.query['hub.challenge']);
  }
  return res.sendStatus(403);
});

// Text out of the Cloud API's message shapes (mirrors Baileys' extractText).
function textOf(m) {
  return m?.text?.body
    || m?.button?.text
    || m?.interactive?.button_reply?.title
    || m?.interactive?.list_reply?.title
    || m?.image?.caption
    || m?.document?.caption
    || null;
}

const RANK = { pending: 0, sent: 1, delivered: 2, read: 3 };
async function onStatus(st) {
  const next = st.status === 'read' ? 'read' : st.status === 'delivered' ? 'delivered' : null;
  if (!next || !st.id) return;
  const { data: lead } = await supabase.from('leads')
    .select('id, welcome_status').eq('welcome_wa_id', st.id).maybeSingle();
  if (!lead) return;
  if ((RANK[next] ?? 0) > (RANK[lead.welcome_status] ?? 0)) {
    await supabase.from('leads').update({ welcome_status: next }).eq('id', lead.id);
  }
  await bumpScore(lead.id, ACTION.delivered);
}

// Always 200 quickly — Meta retries on any non-200 and will disable a webhook
// that keeps failing, so errors are logged rather than surfaced.
cloudWebhook.post('/', (req, res) => {
  res.sendStatus(200);
  try {
    for (const entry of req.body?.entry ?? []) {
      for (const ch of entry.changes ?? []) {
        const v = ch.value ?? {};
        for (const st of v.statuses ?? []) onStatus(st).catch((e) => console.error('[cloud] status:', e.message));

        for (const m of v.messages ?? []) {
          const text = textOf(m);
          if (!text) continue;                       // media-only / unsupported
          const number = String(m.from || '').replace(/\D/g, '');
          const name = v.contacts?.[0]?.profile?.name || null;
          console.log(`[cloud] ⬅ +${number}: ${text.slice(0, 60)}`);
          enqueueMessage({
            sock: cloudSock(),                       // replies go back via Cloud API
            jid: `${number}@s.whatsapp.net`,
            number, name, text,
            raw: { key: { id: m.id } },              // dedupe key for the pipeline
          });
        }
      }
    }
  } catch (err) {
    console.error('[cloud] webhook parse failed:', err.message);
  }
});

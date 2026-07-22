// Action endpoints the Vercel dashboard calls (reads go straight to Supabase;
// only side-effectful actions come through here).
import { Router } from 'express';
import { requireStaff } from './auth.js';
import { supabase } from '../db/supabase.js';
import { updateLeadFields, purgeLead } from '../crm/leads.js';
import { logMessage } from '../crm/messages.js';
import { getUsage } from '../ai/quota.js';
import { getSocket, getWaState, disconnectWhatsApp } from '../whatsapp/connection.js';
import { startFlow } from '../flow/engine.js';
import { startBulkMessage, getBulkStatus, countRecipients } from '../whatsapp/bulkMessage.js';
import QRCode from 'qrcode';

export const apiRoutes = Router();
apiRoutes.use(requireStaff);

async function getLead(req, res) {
  const { data: lead } = await supabase.from('leads').select('*').eq('id', req.params.id).maybeSingle();
  if (!lead) res.status(404).json({ error: 'Lead not found' });
  return lead;
}

// Staff takes over → bot pauses on this lead.
apiRoutes.post('/leads/:id/takeover', async (req, res) => {
  const lead = await getLead(req, res);
  if (!lead) return;
  await updateLeadFields(lead.id, { needs_human: true });
  res.json({ ok: true });
});

// Staff resumes the bot.
apiRoutes.post('/leads/:id/resume', async (req, res) => {
  const lead = await getLead(req, res);
  if (!lead) return;
  await updateLeadFields(lead.id, { needs_human: false, current_stage: lead.current_stage === 'escalated' ? 'faq' : lead.current_stage });
  res.json({ ok: true });
});

// Pause / resume the automated counselling flow for one contact without
// necessarily taking the chat over (spec §15). While paused the bot stays
// silent; resuming continues from the student's saved step.
apiRoutes.post('/leads/:id/automation', async (req, res) => {
  const lead = await getLead(req, res);
  if (!lead) return;
  const paused = !!req.body?.paused;
  await updateLeadFields(lead.id, { automation_paused: paused });
  res.json({ ok: true, automation_paused: paused });
});

// Proactively start the counselling flow for a lead (admin "start conversation").
apiRoutes.post('/leads/:id/start', async (req, res) => {
  const lead = await getLead(req, res);
  if (!lead) return;
  if (getWaState().status !== 'connected') return res.status(503).json({ error: 'WhatsApp not connected' });
  try {
    await startFlow(getSocket(), `${lead.whatsapp_number}@s.whatsapp.net`, lead);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[api] start flow failed for +${lead.whatsapp_number}: ${err.message}`);
    res.status(502).json({ error: `WhatsApp send failed: ${err.message}` });
  }
});

// Send the welcome to many freshly-added leads (bulk import). Responds
// immediately, then sends staggered in the background to avoid WhatsApp rate
// limits. Only leads that haven't started the flow yet are messaged.
apiRoutes.post('/leads/start-bulk', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 500) : [];
  if (!ids.length) return res.status(400).json({ error: 'ids required' });
  if (getWaState().status !== 'connected') return res.status(503).json({ error: 'WhatsApp not connected' });
  res.json({ ok: true, queued: ids.length });

  (async () => {
    const sock = getSocket();
    let sent = 0;
    for (const id of ids) {
      try {
        const { data: lead } = await supabase.from('leads').select('*').eq('id', id).maybeSingle();
        if (lead && !lead.flow_step && !lead.needs_human && !lead.opted_out) {
          await startFlow(sock, `${lead.whatsapp_number}@s.whatsapp.net`, lead);
          sent += 1;
        }
      } catch (err) {
        console.error(`[start-bulk] ${id}: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 4000)); // ~4s gap between sends
    }
    console.log(`[start-bulk] welcome sent to ${sent}/${ids.length} lead(s)`);
  })();
});

// Staff sends a WhatsApp message to the lead via Baileys.
apiRoutes.post('/leads/:id/send', async (req, res) => {
  const { text } = req.body ?? {};
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });
  const lead = await getLead(req, res);
  if (!lead) return;
  try {
    const jid = `${lead.whatsapp_number}@s.whatsapp.net`;
    await getSocket().sendMessage(jid, { text: text.trim() });
    await logMessage({ leadId: lead.id, direction: 'outbound', sender: 'staff', content: text.trim() });
    res.json({ ok: true });
  } catch (err) {
    console.error('[api] staff send failed:', err.message);
    res.status(502).json({ error: `WhatsApp send failed: ${err.message}` });
  }
});

// Privacy purge — permanently deletes the lead + all messages (cascade).
apiRoutes.delete('/leads/:id', async (req, res) => {
  const lead = await getLead(req, res);
  if (!lead) return;
  await purgeLead(lead.id);
  console.log(`[api] Lead +${lead.whatsapp_number} purged by ${req.staff.full_name}`);
  res.json({ ok: true });
});

// Gemini daily usage for the dashboard banner.
apiRoutes.get('/quota', async (_req, res) => {
  res.json(await getUsage());
});

// WhatsApp pairing state for the dashboard "Connect WhatsApp" page.
// The raw QR string is rendered to a data-URL image so the browser can
// show it directly.
apiRoutes.get('/whatsapp/status', async (_req, res) => {
  const { status, number, qr } = getWaState();
  res.json({
    status,
    number,
    qr: qr ? await QRCode.toDataURL(qr, { width: 300, margin: 2 }) : null,
  });
});

// ── Bulk Message ─────────────────────────────────────────────────────
// Audience: filter (?temperature=&stage=&country=) or explicit leadIds
// picked with checkboxes in the dashboard (leadIds wins when present).
const bulkFilter = (q) => ({
  temperature: q.temperature || undefined,
  stage: q.stage || undefined,
  country: q.country || undefined,
  leadIds: Array.isArray(q.leadIds) && q.leadIds.length ? q.leadIds : undefined,
});

apiRoutes.get('/bulk-message/status', (_req, res) => res.json(getBulkStatus()));

apiRoutes.get('/bulk-message/count', async (req, res) => {
  try {
    res.json(await countRecipients(bulkFilter(req.query)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

apiRoutes.post('/bulk-message', async (req, res) => {
  try {
    const status = await startBulkMessage({
      text: req.body?.text,
      media: req.body?.media || undefined,     // { kind, base64, mimetype, fileName }
      buttons: req.body?.buttons || undefined, // up to 3 quick-reply labels
      filter: bulkFilter(req.body ?? {}),
      staffName: req.staff?.full_name,
    });
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Unlink the device and start a fresh pairing cycle (new QR).
apiRoutes.post('/whatsapp/disconnect', async (req, res) => {
  console.log(`[api] WhatsApp disconnect requested by ${req.staff?.full_name ?? 'staff'}`);
  await disconnectWhatsApp();
  res.json({ ok: true });
});

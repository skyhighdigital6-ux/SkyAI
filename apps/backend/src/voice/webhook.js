// Provider webhook receiver — the CRM side of every call.
//
// Mounted UNAUTHENTICATED (the provider can't send a staff JWT) at
// /webhooks/voice, so it is guarded by a shared secret instead: set
// VOICE_WEBHOOK_SECRET and configure the same value at the provider, either as
// an `x-voice-secret` header or a ?secret= query param.
//
// Writes the raw event for audit, upserts the call row, keeps the contact in
// sync, and triggers post-call CRM actions (callback scheduling).
import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { normalizeEvent } from './provider.js';

export const voiceWebhook = Router();

const SECRET = process.env.VOICE_WEBHOOK_SECRET;
const TERMINAL = ['completed', 'failed', 'no_answer', 'busy', 'voicemail', 'transferred'];
// Map a finished call onto the contact's status.
const CONTACT_STATUS = {
  completed: 'completed', transferred: 'completed', voicemail: 'no_answer',
  no_answer: 'no_answer', busy: 'busy', failed: 'failed',
};

voiceWebhook.post('/', async (req, res) => {
  if (SECRET) {
    const given = req.headers['x-voice-secret'] || req.query.secret;
    if (given !== SECRET) return res.status(401).json({ error: 'bad secret' });
  }
  // Always ack fast — providers retry aggressively on non-2xx.
  res.json({ ok: true });

  try {
    const ev = normalizeEvent(req.body);
    if (!ev.providerCallId) return;

    // Find the call this event belongs to (outbound rows are pre-created by the
    // dialer; inbound calls are created here on first sight).
    let { data: call } = await supabase.from('voice_calls')
      .select('*').eq('provider_call_id', ev.providerCallId).maybeSingle();

    if (!call) {
      const meta = ev.metadata || {};
      const { data: created } = await supabase.from('voice_calls').insert({
        provider_call_id: ev.providerCallId,
        campaign_id: meta.campaign_id ?? null,
        contact_id: meta.contact_id ?? null,
        lead_id: meta.lead_id ?? null,
        direction: meta.campaign_id ? 'outbound' : 'inbound',
        status: ev.status || 'in_progress',
      }).select().single();
      call = created;
    }
    if (!call) return;

    await supabase.from('voice_call_events').insert({
      call_id: call.id, provider_call_id: ev.providerCallId,
      event_type: ev.eventType, payload: req.body,
    });

    // Only write fields the event actually carried.
    const patch = {};
    if (ev.status) patch.status = ev.status;
    if (ev.startedAt) patch.started_at = new Date(ev.startedAt).toISOString();
    if (ev.endedAt) patch.ended_at = new Date(ev.endedAt).toISOString();
    if (ev.durationSeconds != null) patch.duration_seconds = ev.durationSeconds;
    if (ev.recordingUrl) patch.recording_url = ev.recordingUrl;
    if (ev.transcript) patch.transcript = ev.transcript;
    if (ev.summary) patch.summary = ev.summary;
    if (ev.sentiment) patch.sentiment = ev.sentiment;
    if (ev.language) patch.language = ev.language;
    if (ev.cost != null) patch.cost = ev.cost;
    if (ev.endedReason && !patch.outcome) patch.outcome = String(ev.endedReason).slice(0, 200);
    if (Object.keys(patch).length) {
      await supabase.from('voice_calls').update(patch).eq('id', call.id);
    }

    // Call finished → settle the contact and run post-call CRM actions.
    if (ev.status && TERMINAL.includes(ev.status)) {
      if (call.contact_id) {
        await supabase.from('voice_contacts')
          .update({ status: CONTACT_STATUS[ev.status] || 'completed' })
          .eq('id', call.contact_id);
      }
      await afterCall({ ...call, ...patch });
      console.log(`[voice] call ${ev.providerCallId} → ${ev.status}${ev.durationSeconds ? ` (${ev.durationSeconds}s)` : ''}`);
    }
  } catch (err) {
    console.error('[voice] webhook error:', err.message);
  }
});

// Post-call CRM actions. Conservative on purpose: if the AI's summary shows the
// caller asked for a callback, schedule one on the linked lead so the existing
// follow-up sweep re-engages them on WhatsApp.
async function afterCall(call) {
  if (!call.lead_id) return;
  const text = `${call.summary || ''} ${call.transcript || ''}`.toLowerCase();
  if (!text.trim()) return;

  const wantsCallback = /\b(call back|callback|call me later|contact me later|follow up|busy right now|call tomorrow)\b/.test(text);
  if (wantsCallback) {
    const when = new Date(Date.now() + 2 * 86400000); // default: 2 days
    await supabase.from('leads').update({
      follow_up_date: when.toISOString(), follow_up_sent: false,
      reminder_8h_sent: true, reminder_24h_sent: true,
    }).eq('id', call.lead_id);
    console.log(`[voice] callback scheduled for lead ${call.lead_id}`);
  }
}

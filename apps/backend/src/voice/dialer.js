// Outbound campaign dialer.
//
// Wakes on an interval, finds running campaigns that are inside their calling
// window, and tops each up to its concurrency limit by placing calls for
// pending contacts. Every attempt is written to voice_calls; the provider's
// webhooks fill in status/transcript/recording later.
//
// Completely dormant unless VOICE_API_KEY is set (see provider.js), so it can
// never disturb the WhatsApp bot.
import { supabase } from '../db/supabase.js';
import { placeCall, voiceEnabled, providerName } from './provider.js';

const TICK_MS = 15 * 1000;
const GAP_MS = 1200;                 // small stagger between dials
const LIVE = ['queued', 'ringing', 'in_progress'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Is "now" (IST) inside the campaign's allowed calling window?
function insideWindow(c) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMin = (t) => { const [h, m] = String(t || '00:00').split(':').map(Number); return h * 60 + (m || 0); };
  const start = toMin(c.call_window_start), end = toMin(c.call_window_end);
  return start <= end ? mins >= start && mins <= end : mins >= start || mins <= end;
}

async function runCampaign(campaign) {
  // Respect the scheduled start time.
  if (campaign.scheduled_at && new Date(campaign.scheduled_at) > new Date()) return;
  if (!insideWindow(campaign)) return;

  const { count: live } = await supabase.from('voice_calls')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id).in('status', LIVE);
  const slots = Math.max(0, (campaign.concurrency || 3) - (live || 0));
  if (!slots) return;

  const { data: contacts } = await supabase.from('voice_contacts')
    .select('*').eq('campaign_id', campaign.id).eq('status', 'pending')
    .lt('attempts', campaign.max_attempts || 1)
    .order('id').limit(slots);

  if (!contacts?.length) {
    // Nothing pending and nothing in flight → the campaign is done.
    if (!live) {
      await supabase.from('voice_campaigns')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', campaign.id).eq('status', 'running');
      console.log(`[dialer] campaign "${campaign.name}" completed`);
    }
    return;
  }

  const { data: agent } = campaign.agent_id
    ? await supabase.from('voice_agents').select('*').eq('id', campaign.agent_id).maybeSingle()
    : { data: null };

  for (const contact of contacts) {
    // Claim the contact first so a slow provider can't double-dial it.
    await supabase.from('voice_contacts')
      .update({ status: 'calling', attempts: contact.attempts + 1, last_attempt_at: new Date().toISOString() })
      .eq('id', contact.id);
    try {
      const { providerCallId } = await placeCall({
        toNumber: contact.phone,
        agent,
        metadata: { campaign_id: campaign.id, contact_id: contact.id, lead_id: contact.lead_id },
      });
      await supabase.from('voice_calls').insert({
        campaign_id: campaign.id, contact_id: contact.id, lead_id: contact.lead_id,
        provider: providerName(), provider_call_id: providerCallId,
        direction: 'outbound', from_number: campaign.from_number, to_number: contact.phone,
        status: 'queued',
      });
      console.log(`[dialer] dialing +${contact.phone} (campaign ${campaign.id})`);
    } catch (err) {
      console.error(`[dialer] failed to dial +${contact.phone}: ${err.message}`);
      await supabase.from('voice_contacts')
        .update({ status: contact.attempts + 1 >= (campaign.max_attempts || 1) ? 'failed' : 'pending' })
        .eq('id', contact.id);
      await supabase.from('voice_calls').insert({
        campaign_id: campaign.id, contact_id: contact.id, lead_id: contact.lead_id,
        provider: providerName(), direction: 'outbound',
        to_number: contact.phone, status: 'failed', outcome: err.message.slice(0, 200),
      });
    }
    await sleep(GAP_MS);
  }
}

export async function runDialerTick() {
  if (!voiceEnabled()) return;
  const { data: campaigns, error } = await supabase.from('voice_campaigns')
    .select('*').eq('direction', 'outbound').eq('status', 'running');
  if (error) { console.error('[dialer] query failed:', error.message); return; }
  for (const c of campaigns ?? []) {
    try { await runCampaign(c); }
    catch (err) { console.error(`[dialer] campaign ${c.id} error: ${err.message}`); }
  }
}

export function startDialer() {
  if (!voiceEnabled()) {
    console.log('[dialer] voice calling not configured (VOICE_API_KEY unset) — dialer idle');
    return;
  }
  setTimeout(runDialerTick, 20 * 1000);
  setInterval(runDialerTick, TICK_MS);
  console.log(`[dialer] outbound dialer armed (${providerName()}, ${TICK_MS / 1000}s tick)`);
}

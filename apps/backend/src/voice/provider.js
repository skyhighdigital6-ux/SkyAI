// Voice-provider adapter.
//
// The real-time voice agent (STT ↔ LLM ↔ TTS, barge-in, accents, emotion) is
// handled by a managed provider. This module is the thin, swappable seam: the
// rest of the platform only speaks `placeCall()` / `normalizeEvent()`.
//
// Configure with env:
//   VOICE_PROVIDER   vapi (default) | retell | bland
//   VOICE_API_KEY    provider API key           ← without this everything is inert
//   VOICE_PHONE_ID   provider phone-number id used as caller ID
//   VOICE_WEBHOOK_SECRET  shared secret we verify on inbound webhooks
const PROVIDER = (process.env.VOICE_PROVIDER || 'vapi').toLowerCase();
const API_KEY = process.env.VOICE_API_KEY;
const PHONE_ID = process.env.VOICE_PHONE_ID;

/** Voice calling stays completely dormant until an API key is configured. */
export const voiceEnabled = () => !!API_KEY;
export const providerName = () => PROVIDER;

const ENDPOINTS = {
  vapi: 'https://api.vapi.ai/call',
  retell: 'https://api.retellai.com/v2/create-phone-call',
  bland: 'https://api.bland.ai/v1/calls',
};

/**
 * Place one outbound call. Returns { providerCallId } or throws.
 * `agent` is a row from voice_agents; `metadata` is echoed back on webhooks so
 * we can tie the call back to its campaign/contact.
 */
export async function placeCall({ toNumber, agent, metadata = {} }) {
  if (!voiceEnabled()) throw new Error('VOICE_API_KEY not configured');
  const url = ENDPOINTS[PROVIDER];
  if (!url) throw new Error(`Unsupported VOICE_PROVIDER: ${PROVIDER}`);

  let body;
  if (PROVIDER === 'vapi') {
    body = {
      phoneNumberId: PHONE_ID,
      customer: { number: `+${String(toNumber).replace(/\D/g, '')}` },
      ...(agent?.provider_agent_id ? { assistantId: agent.provider_agent_id } : {}),
      metadata,
    };
  } else if (PROVIDER === 'retell') {
    body = {
      from_number: process.env.VOICE_FROM_NUMBER,
      to_number: `+${String(toNumber).replace(/\D/g, '')}`,
      override_agent_id: agent?.provider_agent_id || undefined,
      metadata,
    };
  } else {
    body = {
      phone_number: `+${String(toNumber).replace(/\D/g, '')}`,
      task: agent?.system_prompt,
      first_sentence: agent?.first_message,
      request_data: metadata,
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || `Provider HTTP ${res.status}`);

  const providerCallId = json.id || json.call_id || json.callId;
  if (!providerCallId) throw new Error('Provider did not return a call id');
  return { providerCallId, raw: json };
}

// Map provider-specific webhook payloads onto our own shape.
const STATUS_MAP = {
  queued: 'queued', scheduled: 'queued', ringing: 'ringing',
  'in-progress': 'in_progress', in_progress: 'in_progress', ongoing: 'in_progress', answered: 'in_progress',
  ended: 'completed', completed: 'completed', 'call-ended': 'completed',
  failed: 'failed', error: 'failed',
  'no-answer': 'no_answer', no_answer: 'no_answer', busy: 'busy',
  voicemail: 'voicemail', transferred: 'transferred', 'forwarded': 'transferred',
};

/**
 * Normalize a webhook body into
 * { providerCallId, eventType, status, startedAt, endedAt, durationSeconds,
 *   recordingUrl, transcript, summary, sentiment, language, cost, metadata }
 * Unknown fields simply come back undefined — the caller only writes what's set.
 */
export function normalizeEvent(body) {
  const m = body?.message ?? body;                       // vapi nests under .message
  const call = m?.call ?? body?.call ?? m ?? {};
  const analysis = m?.analysis ?? {};
  const rawStatus = String(m?.status ?? call?.status ?? m?.type ?? '').toLowerCase();

  const durationRaw = m?.durationSeconds ?? m?.duration ?? call?.duration_ms;
  const duration = durationRaw == null ? undefined
    : Number(durationRaw) > 10000 ? Math.round(Number(durationRaw) / 1000) : Math.round(Number(durationRaw));

  return {
    providerCallId: call?.id || m?.callId || m?.call_id || body?.call_id,
    eventType: m?.type || m?.event || rawStatus || 'unknown',
    status: STATUS_MAP[rawStatus],
    startedAt: m?.startedAt || call?.startedAt || call?.start_timestamp,
    endedAt: m?.endedAt || call?.endedAt || call?.end_timestamp,
    durationSeconds: Number.isFinite(duration) ? duration : undefined,
    recordingUrl: m?.recordingUrl || m?.recording_url || call?.recordingUrl,
    transcript: typeof m?.transcript === 'string' ? m.transcript
      : Array.isArray(m?.transcript) ? m.transcript.map((t) => `${t.role || t.speaker}: ${t.content || t.text}`).join('\n')
      : undefined,
    summary: m?.summary || analysis?.summary,
    sentiment: analysis?.sentiment || m?.sentiment,
    language: m?.language,
    cost: m?.cost ?? call?.cost,
    endedReason: m?.endedReason || m?.disconnection_reason,
    metadata: m?.metadata || call?.metadata || body?.metadata || {},
  };
}

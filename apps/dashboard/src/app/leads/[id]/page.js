'use client';
// Lead detail — full CRM profile + chat transcript + Take Over / Resume /
// staff send / purge. Reads via Supabase; actions via the Railway backend.
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { backendApi } from '../../../lib/backendApi';
import { DEMO, demoLeads, demoMessages, STAGE_META } from '../../../lib/demo';
import TopBar from '../../../components/TopBar';

const TEMP_BADGE = { Hot: ['hot', '🔴 Hot'], Warm: ['warm', '🟡 Warm'], Cold: ['cold', '⚪ Cold'] };

export default function LeadDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [lead, setLead] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (DEMO) {
      const l = demoLeads.find((d) => d.id === id);
      if (l) setLead((prev) => prev ?? { ...l });
      setMessages((prev) => (prev.length ? prev : [...(demoMessages[id] ?? [])]));
      return;
    }
    const [{ data: l }, { data: msgs }] = await Promise.all([
      supabase.from('leads').select('*').eq('id', id).maybeSingle(),
      supabase.from('messages').select('*').eq('lead_id', id).order('created_at'),
    ]);
    if (l) setLead(l);
    if (msgs) setMessages(msgs);
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function action(name, fn) {
    setBusy(name);
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  }

  const takeover = () => DEMO
    ? setLead({ ...lead, needs_human: true })
    : action('takeover', () => backendApi(`/leads/${id}/takeover`, { method: 'POST' }));
  const resume = () => DEMO
    ? setLead({ ...lead, needs_human: false })
    : action('resume', () => backendApi(`/leads/${id}/resume`, { method: 'POST' }));
  const send = () => {
    if (DEMO) {
      if (!draft.trim()) return;
      setMessages([...messages, { id: Date.now(), direction: 'outbound', sender: 'staff', content: draft.trim(), message_type: 'text', created_at: new Date().toISOString() }]);
      setDraft('');
      return;
    }
    return action('send', async () => {
    if (!draft.trim()) return;
      await backendApi(`/leads/${id}/send`, { method: 'POST', body: { text: draft } });
      setDraft('');
    });
  };
  const purge = () => {
    if (DEMO) { alert('Demo mode — lead purge works once Supabase is connected.'); return; }
    if (!confirm('Permanently delete this lead and ALL their messages? This cannot be undone.')) return;
    action('purge', async () => {
      // Serverless route (works on Vercel too — no Railway backend needed).
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/purge-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ leadId: id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Delete failed (${res.status})`);
      router.push('/leads');
    });
  };

  if (!lead) return <div className="muted">Loading…</div>;
  const [cls, label] = TEMP_BADGE[lead.lead_temperature] ?? TEMP_BADGE.Cold;

  return (
    <div>
      <TopBar />
      <h1>
        {lead.name || `+${lead.whatsapp_number}`}{' '}
        <span className={`badge ${cls}`}>{label} · {lead.lead_score}</span>{' '}
        <span className={`badge ${STAGE_META[lead.current_stage]?.cls ?? "st-gray"}`}>{STAGE_META[lead.current_stage]?.label ?? lead.current_stage}</span>{' '}
        {lead.needs_human && <span className="badge human">🙋 human handling</span>}
      </h1>
      {error && <div className="banner red">{error}</div>}

      <div className="detail">
        <div className="card profile">
          <dl>
            <dt>WhatsApp</dt><dd>+{lead.whatsapp_number}</dd>
            <dt>Country / Course</dt><dd>{[lead.interested_country, lead.interested_course].filter(Boolean).join(' / ') || '—'}</dd>
            <dt>NEET status</dt><dd>{lead.neet_status || '—'}</dd>
            <dt>Academics</dt><dd>{lead.academic_details || '—'}</dd>
            <dt>Budget</dt><dd>{lead.budget_range || '—'}</dd>
            <dt>Tone profile</dt>
            <dd>{lead.tone_profile ? Object.entries(lead.tone_profile).map(([k, v]) => `${k}: ${v}`).join(' · ') : '—'}</dd>
            <dt>Documents shared</dt>
            <dd>{lead.documents_shared?.length ? lead.documents_shared.map((d) => d.doc).join(', ') : '—'}</dd>
            <dt>Created</dt><dd>{new Date(lead.created_at).toLocaleString()}</dd>
          </dl>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {lead.needs_human
              ? <button className="btn" onClick={resume} disabled={!!busy}>{busy === 'resume' ? '…' : '▶ Resume bot'}</button>
              : <button className="btn" onClick={takeover} disabled={!!busy}>{busy === 'takeover' ? '…' : '✋ Take over'}</button>}
            <button className="btn danger" onClick={purge} disabled={!!busy}>Purge data</button>
          </div>
        </div>

        <div className="card">
          <div className="chat">
            {messages.length === 0 && <div className="muted">No messages yet.</div>}
            {messages.map((m) => (
              <div key={m.id} className={`msg ${m.direction} ${m.sender === 'staff' ? 'staff' : ''}`}>
                {m.content}
                <div className="meta">
                  {m.sender} · {m.message_type !== 'text' ? `${m.message_type} · ` : ''}{new Date(m.created_at).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
          {lead.needs_human ? (
            <div className="sendbox">
              <textarea
                placeholder="Type a reply as staff…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              />
              <button className="btn" onClick={send} disabled={busy === 'send' || !draft.trim()}>Send</button>
            </div>
          ) : (
            <div className="muted" style={{ marginTop: 10 }}>Bot is handling this chat. Take over to reply manually.</div>
          )}
        </div>
      </div>
    </div>
  );
}

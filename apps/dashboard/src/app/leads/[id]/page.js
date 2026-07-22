'use client';
// Lead detail — full CRM profile + chat transcript + Take Over / Resume /
// staff send / purge. Reads via Supabase; actions via the Railway backend.
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { backendApi } from '../../../lib/backendApi';
import { DEMO, demoLeads, demoMessages } from '../../../lib/demo';
import { fetchCatalogMaps, leadCourse, leadState, leadCollege, leadCounsellor, leadScore, leadTemp, TEMP_CLS } from '../../../lib/catalogNames';
import TopBar from '../../../components/TopBar';
import LeadEdit from '../../../components/LeadEdit';

const STATUS_CLS = {
  'New Lead': 'st-blue', 'Course Selected': 'st-blue', 'State Selected': 'st-teal',
  'College Selected': 'st-teal', 'Documents Shared': 'st-purple', 'Guidance Completed': 'st-green',
  'Callback Requested': 'st-amber', 'Human Assistance Required': 'st-red',
  'Counselor Assigned': 'st-amber', 'Not Interested': 'st-gray',
};

export default function LeadDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [lead, setLead] = useState(null);
  const [maps, setMaps] = useState({ courses: {}, states: {}, colleges: {}, counsellors: {} });
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

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

  useEffect(() => { if (!DEMO) fetchCatalogMaps().then(setMaps); }, []);

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
  const temp = leadTemp(lead);

  return (
    <div>
      <TopBar />
      <h1>
        {lead.name || `+${lead.whatsapp_number}`}{' '}
        <span className={`badge ${TEMP_CLS[temp]}`}>{temp} · {leadScore(lead)}</span>{' '}
        {lead.flow_status && <span className={`badge ${STATUS_CLS[lead.flow_status] ?? 'st-gray'}`}>{lead.flow_status}</span>}{' '}
        {lead.needs_human && <span className="badge human">🙋 human handling</span>}
      </h1>
      {error && <div className="banner red">{error}</div>}

      <div className="detail">
        <div className="card profile">
          <dl>
            <dt>WhatsApp</dt><dd>+{lead.whatsapp_number}</dd>
            <dt>Status</dt><dd>{lead.flow_status || '—'}</dd>
            <dt>Course</dt><dd>{leadCourse(lead, maps)}</dd>
            <dt>State</dt><dd>{leadState(lead, maps)}</dd>
            <dt>College</dt><dd>{leadCollege(lead, maps)}</dd>
            <dt>Counsellor</dt><dd>{leadCounsellor(lead, maps)}</dd>
            <dt>Source</dt><dd>{lead.entry_source || '—'}</dd>
            <dt>Documents sent</dt>
            <dd>{lead.flow_documents_sent?.length ? lead.flow_documents_sent.map((d) => d.type).join(', ') : '—'}</dd>
            <dt>Last active</dt><dd>{lead.last_active_at ? new Date(lead.last_active_at).toLocaleString() : '—'}</dd>
            <dt>Created</dt><dd>{new Date(lead.created_at).toLocaleString()}</dd>
          </dl>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {lead.needs_human
              ? <button className="btn" onClick={resume} disabled={!!busy}>{busy === 'resume' ? '…' : '▶ Resume bot'}</button>
              : <button className="btn" onClick={takeover} disabled={!!busy}>{busy === 'takeover' ? '…' : '✋ Take over'}</button>}
            <button className="btn secondary" onClick={() => setEditing(true)}>✏️ Edit</button>
            <button className="btn danger" onClick={purge} disabled={!!busy}>Purge data</button>
          </div>
          <LeadEdit lead={lead} open={editing} onClose={() => setEditing(false)} onSaved={load} />
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

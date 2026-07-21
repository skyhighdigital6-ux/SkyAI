'use client';
// WhatsApp-style inbox — chat list left, full conversation right.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { DEMO, demoLeads, demoMessages, STAGE_META } from '../../lib/demo';
import TopBar from '../../components/TopBar';
import { Ic } from '../../components/Icons';

const initials = (n) => (n || '??').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const hhmm = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const timeAgo = (iso) => {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
};

export default function Conversations() {
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [selId, setSelId] = useState(null);
  const [messages, setMessages] = useState([]);

  const load = useCallback(async () => {
    if (DEMO) { setLeads([...demoLeads].sort((a, b) => new Date(b.last_active_at) - new Date(a.last_active_at))); return; }
    const { data } = await supabase.from('leads').select('*').order('last_active_at', { ascending: false });
    setLeads(data ?? []);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  useEffect(() => {
    if (!leads.length) return;
    if (!selId) { setSelId(leads[0].id); return; }
    if (DEMO) { setMessages(demoMessages[selId] ?? []); return; }
    supabase.from('messages').select('*').eq('lead_id', selId).order('created_at')
      .then(({ data }) => setMessages(data ?? []));
  }, [leads, selId]);

  const sel = leads.find((l) => l.id === selId);
  const lastMsg = (id) => (DEMO ? (demoMessages[id] ?? []).at(-1)?.content : STAGE_META[leads.find((l) => l.id === id)?.current_stage]?.label) ?? '—';

  return (
    <div>
      <TopBar />
      <div className="pagehead"><h1>Conversations</h1><span className="sub">{leads.length} active chats</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0,1fr)', gap: 13, alignItems: 'stretch', flex: 1, minHeight: 0 }}>
        <div className="card" style={{ marginBottom: 0, overflowY: 'auto' }}>
          {leads.map((l) => (
            <div key={l.id} className={`rowitem ${l.id === selId ? 'sel' : ''}`} onClick={() => setSelId(l.id)}>
              <span className="avatar sq">{initials(l.name)}</span>
              <span className="nm">{l.name || `+${l.whatsapp_number}`}<small>{lastMsg(l.id)}</small></span>
              <span className="end">{timeAgo(l.last_active_at)}<br />{l.needs_human ? '🙋' : '🤖'}</span>
            </div>
          ))}
          {!leads.length && <div className="muted">No conversations yet.</div>}
        </div>
        {sel && (
          <div className="card chatcard" style={{ marginBottom: 0 }}>
            <div className="chat-head">
              <span className="avatar sq">{initials(sel.name)}</span>
              <span className="who">{sel.name}<small>+{sel.whatsapp_number}</small></span>
              <span className={`badge ${STAGE_META[sel.current_stage]?.cls ?? 'st-gray'}`}>{STAGE_META[sel.current_stage]?.label}</span>
              <span className={`badge ${sel.needs_human ? 'yes' : 'human'}`} style={{ marginLeft: 'auto' }}>
                {sel.needs_human ? '✋ Human handling' : '✓ Auto-reply active'}
              </span>
              <button className="btn secondary" onClick={() => router.push(`/leads/${sel.id}`)}>Open lead →</button>
            </div>
            <div className="chat" style={{ maxHeight: 'none' }}>
              {messages.map((m) => m.message_type === 'pdf' ? (
                <div key={m.id} className={`msg ${m.direction} pdf`}>
                  <span className="pdf-ico">PDF</span>
                  <span>{m.content.replace(/^\[sent PDF: |\]$/g, '')}<div className="meta">{hhmm(m.created_at)} ✓✓</div></span>
                </div>
              ) : (
                <div key={m.id} className={`msg ${m.direction} ${m.sender === 'staff' ? 'staff' : ''}`}>
                  {m.content}
                  <div className="meta">{hhmm(m.created_at)}{m.direction === 'outbound' ? ' ✓✓' : ''}</div>
                </div>
              ))}
              {!messages.length && <div className="muted">No messages yet.</div>}
            </div>
            <div className="sendbox">
              <span className="muted"><Ic name="smile" size={18} /></span><span className="muted"><Ic name="clip" size={17} /></span>
              <span className="hint">{sel.needs_human ? 'Reply from the lead page →' : 'Bot is replying — Take Over to type'}</span>
              <button className={`send-circle ${sel.needs_human ? 'live' : ''}`} onClick={() => router.push(`/leads/${sel.id}`)}><Ic name="send" size={15} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';
// Main dashboard — stat cards, leads table, live chat preview, lead profile,
// KB preview and analytics preview, matching the SkyAI CRM design.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { backendApi } from '../../lib/backendApi';
import { DEMO, demoLeads, demoMessages, demoQuota } from '../../lib/demo';
import { fetchCatalogMaps, leadCourse, leadState, leadCollege, leadCounsellor, leadScore, leadTemp, TEMP_CLS } from '../../lib/catalogNames';
import TopBar from '../../components/TopBar';
import { Ic } from '../../components/Icons';

const STATUS_CLS = {
  'New Lead': 'st-blue', 'Course Selected': 'st-blue', 'State Selected': 'st-teal',
  'College Selected': 'st-teal', 'Documents Shared': 'st-purple', 'Guidance Completed': 'st-green',
  'Callback Requested': 'st-amber', 'Human Assistance Required': 'st-red', 'Not Interested': 'st-gray',
};
const DOC_LABEL = { brochure: 'Brochure', fee_structure: 'Fee Structure', other: 'Admission Document' };

const initials = (n) => (n || '??').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const timeAgo = (iso) => {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return m < 2880 ? 'Yesterday' : `${Math.floor(m / 1440)}d ago`;
};
const hhmm = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function Dashboard() {
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [selId, setSelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [quota, setQuota] = useState(DEMO ? demoQuota : null);
  const [catalog, setCatalog] = useState({ courses: 0, states: 0, colleges: 0 });
  const [maps, setMaps] = useState({ courses: {}, states: {}, colleges: {}, counsellors: {} });
  const [status, setStatus] = useState('');
  const [human, setHuman] = useState('');

  const load = useCallback(async () => {
    if (DEMO) {
      setLeads([...demoLeads].sort((a, b) => b.lead_score - a.lead_score));
      return;
    }
    const { data } = await supabase.from('leads').select('*').order('lead_score', { ascending: false });
    setLeads(data ?? []);
    backendApi('/quota').then(setQuota).catch(() => {});
    Promise.all([
      supabase.from('courses').select('id', { count: 'exact', head: true }),
      supabase.from('states').select('id', { count: 'exact', head: true }),
      supabase.from('colleges').select('id', { count: 'exact', head: true }),
    ]).then(([c, s, g]) => setCatalog({ courses: c.count ?? 0, states: s.count ?? 0, colleges: g.count ?? 0 }));
    fetchCatalogMaps().then(setMaps);
  }, []);

  useEffect(() => {
    load();
    if (!DEMO) { const t = setInterval(load, 10000); return () => clearInterval(t); }
  }, [load]);

  useEffect(() => {
    if (!leads.length) return;
    if (!selId) { setSelId(leads.find((l) => l.id === 'demo-2')?.id ?? leads[0].id); return; }
    if (DEMO) { setMessages(demoMessages[selId] ?? []); return; }
    supabase.from('messages').select('*').eq('lead_id', selId).order('created_at')
      .then(({ data }) => setMessages(data ?? []));
  }, [leads, selId]);

  const filtered = useMemo(() => leads.filter((l) =>
    (!status || l.flow_status === status) &&
    (!human || String(l.needs_human) === human)
  ), [leads, status, human]);

  const sel = leads.find((l) => l.id === selId);
  const count = (fn) => leads.filter(fn).length;
  const hot = count((l) => l.lead_temperature === 'Hot');
  const escal = count((l) => l.needs_human);
  const won = count((l) => l.current_stage === 'closed_won');
  const convRate = leads.length ? Math.round((won / leads.length) * 1000) / 10 : 0;

  const FUNNEL = [
    ['New Inquiry', leads.length],
    ['Eligibility Check', count((l) => !['new', 'discovery'].includes(l.current_stage))],
    ['Brochure Sent', count((l) => (l.documents_shared?.length ?? 0) > 0)],
    ['Documents Pending', count((l) => ['documents', 'admission'].includes(l.current_stage))],
    ['Converted', won],
  ];
  const fmax = Math.max(1, ...FUNNEL.map(([, n]) => n));
  const cold = count((l) => l.lead_temperature === 'Cold');
  const warm = count((l) => l.lead_temperature === 'Warm');
  const hotDeg = leads.length ? (hot / leads.length) * 360 : 0;
  const warmDeg = leads.length ? (warm / leads.length) * 360 : 0;

  const toneChips = sel?.tone_profile
    ? [sel.tone_profile.language_mix, sel.tone_profile.formality,
       sel.tone_profile.message_length === 'short' ? 'short replies' : `${sel.tone_profile.message_length} replies`,
       sel.tone_profile.uses_emoji ? 'light emoji 😊' : 'no emoji'].filter(Boolean)
    : [];

  return (
    <div>
      <TopBar />



      <div className="grid-main">
        <div className="leftcol">
          <div className="stats">
        <div className="stat"><div className="ico green"><Ic name="users" /></div><div><div className="lbl">Total Leads</div><div className="num">{leads.length}</div><span className="trend up">↑ 18% vs last 7 days</span></div></div>
        <div className="stat"><div className="ico red"><Ic name="flame" /></div><div><div className="lbl">Hot Leads</div><div className="num">{hot}</div><span className="trend up">↑ 22% vs last 7 days</span></div></div>
        <div className="stat"><div className="ico mint"><Ic name="chat" /></div><div><div className="lbl">Active Chats</div><div className="num">{count((l) => Date.now() - new Date(l.last_active_at) < 86400000)}</div><span className="trend up">↑ 8% vs last 7 days</span></div></div>
        <div className="stat"><div className="ico gray"><Ic name="user" /></div><div><div className="lbl">Human Escalations</div><div className="num">{escal}</div><span className="trend down">↓ 12% vs last 7 days</span></div></div>
        <div className="stat"><div className="ico blue"><Ic name="trend" /></div><div><div className="lbl">Conversion Rate</div><div className="num">{convRate}%</div><span className="trend up">↑ 2.4% vs last 7 days</span></div></div>
      </div>
          <div className="table-chat">
          <div className="card">
            <div className="filters">
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {Object.keys(STATUS_CLS).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={human} onChange={(e) => setHuman(e.target.value)}>
                <option value="">Needs Human</option><option value="true">Yes</option><option value="false">No</option>
              </select>
              <input type="date" />
              <span className="sortnote">Sorted by <b>most recent</b> ⇅</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Name</th><th>Number</th><th>Temperature</th><th>Score</th><th>Stage</th><th>Course</th><th>State</th><th>College</th><th>Counsellor</th><th>Source</th><th>Last Active</th><th>Needs Human</th></tr></thead>
                <tbody>
                  {filtered.map((l) => {
                    const temp = leadTemp(l);
                    return (
                      <tr key={l.id} className={l.id === selId ? 'sel' : ''} onClick={() => setSelId(l.id)}>
                        <td><span className="namecell"><span className="avatar sq">{initials(l.name)}</span>{l.name || '—'}</span></td>
                        <td><span className="numcell"><span className="dot" />+{l.whatsapp_number}</span></td>
                        <td><span className={`badge ${TEMP_CLS[temp]}`}><span className="b-dot" />{temp}</span></td>
                        <td><b>{leadScore(l)}</b></td>
                        <td>{l.flow_status ? <span className={`badge ${STATUS_CLS[l.flow_status] ?? 'st-gray'}`}>{l.flow_status}</span> : '—'}</td>
                        <td>{leadCourse(l, maps)}</td>
                        <td>{leadState(l, maps)}</td>
                        <td>{leadCollege(l, maps)}</td>
                        <td>{leadCounsellor(l, maps)}</td>
                        <td className="muted">{l.entry_source ?? '—'}</td>
                        <td>{timeAgo(l.last_active_at)}</td>
                        <td><span className={`badge ${l.needs_human ? 'yes' : 'no'}`}>{l.needs_human ? 'Yes' : 'No'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="tfoot"><span>Showing 1 to {filtered.length} of {leads.length} leads</span><span className="badge no">1</span></div>
          </div>

          {sel && (
            <div className="card chatcard">
              <div className="chat-head">
                <span className="avatar sq">{initials(sel.name)}</span>
                <span className="who">{sel.name}<small>+{sel.whatsapp_number}</small></span>
                <span className={`badge ${sel.needs_human ? 'yes' : 'human'}`} style={{ marginLeft: 'auto' }}>
                  {sel.needs_human ? '✋ Human' : '✓ Auto-reply active'}
                </span>
              </div>
              <div className="chat">
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
                <span className="hint">{sel.needs_human ? 'You are replying as staff…' : 'Bot is replying — Take Over to type'}</span>
                <button className={`send-circle ${sel.needs_human ? 'live' : ''}`}><Ic name="send" size={15} /></button>
              </div>
            </div>
          )}
          </div>

          <div className="grid-2">
            <div className="card">
              <h3>Catalog Preview <span className="linky" style={{ float: 'right' }} onClick={() => router.push('/catalog')}>Manage →</span></h3>
              <div className="kb-mini">
                <div className="cell"><b>Courses</b>{catalog.courses}</div>
                <div className="cell"><b>States</b>{catalog.states}</div>
                <div className="cell"><b>Colleges</b>{catalog.colleges}</div>
              </div>
              <div className="muted" style={{ marginTop: 8 }}>Courses, states &amp; colleges shown in the WhatsApp flow.</div>
            </div>

            <div className="card">
              <h3>Analytics Preview <span className="linky" style={{ float: 'right' }} onClick={() => router.push('/analytics')}>View full analytics →</span></h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr', gap: 12, alignItems: 'start' }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="muted" style={{ fontWeight: 600 }}>Leads by Temperature</div>
                  <div className="donut" style={{ background: `conic-gradient(#dc2626 0 ${hotDeg}deg, #f59e0b ${hotDeg}deg ${hotDeg + warmDeg}deg, #cbd5e1 ${hotDeg + warmDeg}deg 360deg)` }}>
                    <span className="center">{leads.length}<small>Total</small></span>
                  </div>
                </div>
                <div>
                  <div className="muted" style={{ fontWeight: 600, marginBottom: 4 }}>Conversion Funnel</div>
                  {FUNNEL.map(([lbl, n]) => (
                    <div key={lbl} className="funnel-row">
                      <span>{lbl}</span>
                      <span className="bar"><i style={{ width: `${(n / fmax) * 100}%` }} /></span>
                      <span className="n">{n} ({leads.length ? Math.round((n / leads.length) * 100) : 0}%)</span>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className="muted" style={{ fontWeight: 600 }}>Gemini Usage</div>
                  <div className="donut" style={{ background: `conic-gradient(#3f8f2f 0 ${(quota?.gemini_pct ?? 0) * 3.6}deg, #b5dc4e ${(quota?.gemini_pct ?? 0) * 3.6}deg 360deg)` }}>
                    <span className="center">{quota?.gemini_pct ?? 0}%<small>Used</small></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="procol">
          {sel && (
            <>
              <div className="card">
                <h3>Lead Profile</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span className="avatar sq">{initials(sel.name)}</span>
                  <b>{sel.name} ✓</b> <span style={{ color: '#16a34a' }}>●</span>
                </div>
                <div className="kv"><span>Status</span><b>{sel.flow_status ? <span className={`badge ${STATUS_CLS[sel.flow_status] ?? 'st-gray'}`}>{sel.flow_status}</span> : '—'}</b></div>
                <div className="kv"><span>Course</span><b>{leadCourse(sel, maps)}</b></div>
                <div className="kv"><span>State</span><b>{leadState(sel, maps)}</b></div>
                <div className="kv"><span>College</span><b>{leadCollege(sel, maps)}</b></div>
                <div className="kv"><span>Counsellor</span><b>{leadCounsellor(sel, maps)}</b></div>
                <div className="kv"><span>Source</span><b>{sel.entry_source ?? '—'}</b></div>
                <div className="kv"><span>Needs Human</span><b><span className={`badge ${sel.needs_human ? 'yes' : 'no'}`}>{sel.needs_human ? 'Yes' : 'No'}</span></b></div>
                <div className="kv"><span>Last Active</span><b>{timeAgo(sel.last_active_at)}</b></div>
              </div>

              {toneChips.length > 0 && (
                <div className="card">
                  <h3>Tone Profile</h3>
                  {toneChips.map((c) => <span key={c} className="chip">{c}</span>)}
                </div>
              )}

              <div className="card grow">
                <h3>Documents Shared ({sel.flow_documents_sent?.length ?? 0})</h3>
                {(sel.flow_documents_sent ?? []).map((d, i) => (
                  <div key={i} className="doc-row">
                    <span className="pdf-ico">PDF</span>
                    <span className="nm">{DOC_LABEL[d.type] ?? 'Document'}<small>{d.path?.split('/').pop() ?? 'PDF'}</small></span>
                    <span className="tm">{d.sent_at ? hhmm(d.sent_at) : ''}</span>
                  </div>
                ))}
                {!sel.flow_documents_sent?.length && <div className="muted">No documents shared yet.</div>}
                <div className="linky" style={{ marginTop: 8 }} onClick={() => router.push('/documents')}>View all documents →</div>
              </div>

              <div className="btnrow" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 12 }}>
                <button className="btn outline" style={{ flex: 1 }} onClick={() => router.push(`/leads/${sel.id}`)}>🤝 Take Over</button>
                <button className="btn outline-red" style={{ flex: 1 }} onClick={() => router.push(`/leads/${sel.id}`)}>⏸ Pause Bot</button>
                <button className="btn" style={{ flexBasis: '100%' }} onClick={() => router.push(`/leads/${sel.id}`)}>Resume</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

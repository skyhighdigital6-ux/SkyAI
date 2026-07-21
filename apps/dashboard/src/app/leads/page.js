'use client';
// Full leads manager — every column, dashboard styling.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { DEMO, demoLeads, STAGE_META, COUNTRY_LABELS } from '../../lib/demo';
import TopBar from '../../components/TopBar';

const TEMP = { Hot: 'hot', Warm: 'warm', Cold: 'cold' };
const initials = (n) => (n || '??').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const COUNTRY = COUNTRY_LABELS;
const timeAgo = (iso) => {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return m < 2880 ? 'Yesterday' : `${Math.floor(m / 1440)}d ago`;
};

export default function Leads() {
  const router = useRouter();
  const [leads, setLeads] = useState(null);
  const [temp, setTemp] = useState('');
  const [stage, setStage] = useState('');
  const [humanOnly, setHumanOnly] = useState(false);
  const [since, setSince] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (DEMO) { setLeads([...demoLeads].sort((a, b) => b.lead_score - a.lead_score)); return; }
    const { data } = await supabase.from('leads').select('*')
      .order('lead_score', { ascending: false }).order('last_active_at', { ascending: false });
    setLeads(data ?? []);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  const deleteLead = async (e, l) => {
    e.stopPropagation();
    if (DEMO) { alert('Demo mode — lead deletion works once Supabase is connected.'); return; }
    if (!confirm(`Permanently delete ${l.name || '+' + l.whatsapp_number} and ALL their messages?\nThis cannot be undone.`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/purge-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ leadId: l.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { alert(`Delete failed: ${json.error || res.status}`); return; }
    load();
  };

  const rows = (leads ?? []).filter((l) =>
    (!temp || l.lead_temperature === temp) &&
    (!stage || l.current_stage === stage) &&
    (!humanOnly || l.needs_human) &&
    (!since || new Date(l.last_active_at) >= new Date(since)) &&
    (!q || (l.name || '').toLowerCase().includes(q.toLowerCase()) || l.whatsapp_number.includes(q))
  );

  return (
    <div>
      <TopBar />
      <div className="pagehead"><h1>Leads</h1><span className="sub">{rows.length} of {leads?.length ?? 0} students</span></div>
      <div className="card">
        <div className="filters">
          <input type="text" placeholder="Search name / number…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={temp} onChange={(e) => setTemp(e.target.value)}>
            <option value="">Temperature</option><option>Hot</option><option>Warm</option><option>Cold</option>
          </select>
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">Stage</option>
            {Object.entries(STAGE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
          <label className="chk"><input type="checkbox" checked={humanOnly} onChange={(e) => setHumanOnly(e.target.checked)} /> Needs human only</label>
          <span className="sortnote">Sorted by <b>Hot leads first</b> ⇅</span>
        </div>
        <table>
          <thead><tr><th>Name</th><th>Number</th><th>Temperature</th><th>Score</th><th>Stage</th><th>Country / Course</th><th>Budget</th><th>NEET</th><th>Last Active</th><th>Needs Human</th><th></th></tr></thead>
          <tbody>
            {leads === null && <tr><td colSpan={11} className="muted">Loading…</td></tr>}
            {rows.length === 0 && leads !== null && <tr><td colSpan={11} className="muted">No leads match.</td></tr>}
            {rows.map((l) => {
              const st = STAGE_META[l.current_stage] ?? { label: l.current_stage, cls: 'st-gray' };
              return (
                <tr key={l.id} onClick={() => router.push(`/leads/${l.id}`)}>
                  <td><span className="namecell"><span className="avatar sq">{initials(l.name)}</span>{l.name || '—'}</span></td>
                  <td><span className="numcell"><span className="dot" />+{l.whatsapp_number}</span></td>
                  <td><span className={`badge ${TEMP[l.lead_temperature]}`}><span className="b-dot" />{l.lead_temperature}</span></td>
                  <td><b>{l.lead_score}</b></td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                  <td>{COUNTRY[l.interested_country] ?? (l.interested_country ? l.interested_country.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—')}{l.interested_course ? ` – ${l.interested_course.toUpperCase()}` : ''}</td>
                  <td>{l.budget_range?.replace(/_/g, '–').replace('under–15L', '<₹15L') ?? '—'}</td>
                  <td>{l.neet_status ? '✓' : '—'}</td>
                  <td>{timeAgo(l.last_active_at)}</td>
                  <td><span className={`badge ${l.needs_human ? 'yes' : 'no'}`}>{l.needs_human ? 'Yes' : 'No'}</span></td>
                  <td>
                    <button
                      title="Delete lead"
                      onClick={(e) => deleteLead(e, l)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, opacity: 0.65 }}
                    >🗑️</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="tfoot"><span>Showing 1 to {rows.length} of {leads?.length ?? 0} leads</span><span className="badge no">1</span></div>
      </div>
    </div>
  );
}

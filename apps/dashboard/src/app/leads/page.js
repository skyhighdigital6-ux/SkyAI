'use client';
// Leads manager — columns reflect the admission-counselling flow:
// Course → State → College → Counsellor + flow status.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { DEMO, demoLeads } from '../../lib/demo';
import { fetchCatalogMaps, leadCourse, leadState, leadCollege, leadCounsellor, leadScore, leadTemp, TEMP_CLS } from '../../lib/catalogNames';
import TopBar from '../../components/TopBar';

const initials = (n) => (n || '??').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const timeAgo = (iso) => {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return m < 2880 ? 'Yesterday' : `${Math.floor(m / 1440)}d ago`;
};

// flow_status -> badge colour
const STATUS_CLS = {
  'New Lead': 'st-blue', 'Course Selected': 'st-blue', 'State Selected': 'st-teal',
  'College Selected': 'st-teal', 'Documents Shared': 'st-purple', 'Guidance Completed': 'st-green',
  'Callback Requested': 'st-amber', 'Human Assistance Required': 'st-red',
  'Counselor Assigned': 'st-amber', 'Not Interested': 'st-gray',
};
const STATUSES = Object.keys(STATUS_CLS);

export default function Leads() {
  const router = useRouter();
  const [leads, setLeads] = useState(null);
  const [maps, setMaps] = useState({ courses: {}, states: {}, colleges: {}, counsellors: {} });
  const [status, setStatus] = useState('');
  const [humanOnly, setHumanOnly] = useState(false);
  const [since, setSince] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (DEMO) { setLeads(demoLeads); return; }
    const { data } = await supabase.from('leads').select('*')
      .order('last_active_at', { ascending: false });
    setLeads(data ?? []);
  }, []);

  useEffect(() => { if (!DEMO) fetchCatalogMaps().then(setMaps); }, []);
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
    (!status || l.flow_status === status) &&
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
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
          <label className="chk"><input type="checkbox" checked={humanOnly} onChange={(e) => setHumanOnly(e.target.checked)} /> Needs human only</label>
          <span className="sortnote">Sorted by <b>most recent</b> ⇅</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr>
              <th>Name</th><th>Number</th><th>Temperature</th><th>Score</th><th>Stage</th>
              <th>Course</th><th>State</th><th>College</th><th>Counsellor</th>
              <th>Source</th><th>Last Active</th><th>Needs Human</th><th></th>
            </tr></thead>
            <tbody>
              {leads === null && <tr><td colSpan={13} className="muted">Loading…</td></tr>}
              {rows.length === 0 && leads !== null && <tr><td colSpan={13} className="muted">No leads match.</td></tr>}
              {rows.map((l) => {
                const cls = STATUS_CLS[l.flow_status] ?? 'st-gray';
                const temp = leadTemp(l);
                return (
                  <tr key={l.id} onClick={() => router.push(`/leads/${l.id}`)}>
                    <td><span className="namecell"><span className="avatar sq">{initials(l.name)}</span>{l.name || '—'}</span></td>
                    <td><span className="numcell"><span className="dot" />+{l.whatsapp_number}</span></td>
                    <td><span className={`badge ${TEMP_CLS[temp]}`}><span className="b-dot" />{temp}</span></td>
                    <td><b>{leadScore(l)}</b></td>
                    <td>{l.flow_status ? <span className={`badge ${cls}`}>{l.flow_status}</span> : '—'}</td>
                    <td>{leadCourse(l, maps)}</td>
                    <td>{leadState(l, maps)}</td>
                    <td>{leadCollege(l, maps)}</td>
                    <td>{leadCounsellor(l, maps)}</td>
                    <td className="muted">{l.entry_source ?? '—'}</td>
                    <td>{timeAgo(l.last_active_at)}</td>
                    <td><span className={`badge ${l.needs_human ? 'yes' : 'no'}`}>{l.needs_human ? 'Yes' : 'No'}</span></td>
                    <td>
                      <button title="Delete lead" onClick={(e) => deleteLead(e, l)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, opacity: 0.65 }}>🗑️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="tfoot"><span>Showing 1 to {rows.length} of {leads?.length ?? 0} leads</span><span className="badge no">1</span></div>
      </div>
    </div>
  );
}

'use client';
// Leads manager — columns reflect the admission-counselling flow:
// Course → State → College → Counsellor + flow status.
// Prioritised by lead score (highest first), then most-recently-active, with
// rich filtering + selectable sort — all applied client-side for instant updates.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { DEMO, demoLeads } from '../../lib/demo';
import { fetchCatalogMaps, leadCourse, leadState, leadCollege, leadCounsellor, leadScore, leadTemp, TEMP_CLS } from '../../lib/catalogNames';
import TopBar from '../../components/TopBar';
import LeadImport from '../../components/LeadImport';

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
  'Auto-Closed (No Response)': 'st-gray',
};
const STATUSES = Object.keys(STATUS_CLS);
const isDelivered = (l) => l.welcome_status === 'delivered' || l.welcome_status === 'read';

// Score thresholds offered in the "min score" filter (match the scoring table).
const SCORE_STEPS = [
  { v: 10, label: '≥ 10 (delivered)' }, { v: 20, label: '≥ 20 (replied)' },
  { v: 30, label: '≥ 30 (course)' }, { v: 50, label: '≥ 50 (state)' },
  { v: 70, label: '70 (college)' },
];

// Selectable sort orders. Every option falls back to most-recently-active.
const ACTIVE_DESC = (a, b) => new Date(b.last_active_at || 0) - new Date(a.last_active_at || 0);
const SORTS = {
  score_desc:  { label: 'Highest score', fn: (a, b) => (leadScore(b) - leadScore(a)) || ACTIVE_DESC(a, b) },
  score_asc:   { label: 'Lowest score',  fn: (a, b) => (leadScore(a) - leadScore(b)) || ACTIVE_DESC(a, b) },
  active_desc: { label: 'Most recently active',  fn: ACTIVE_DESC },
  active_asc:  { label: 'Least recently active', fn: (a, b) => new Date(a.last_active_at || 0) - new Date(b.last_active_at || 0) },
  newest:      { label: 'Newest leads', fn: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0) },
  oldest:      { label: 'Oldest leads', fn: (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0) },
  az:          { label: 'Name A–Z', fn: (a, b) => (a.name || '').localeCompare(b.name || '') },
  za:          { label: 'Name Z–A', fn: (a, b) => (b.name || '').localeCompare(a.name || '') },
};

const sortedNames = (obj) => Object.values(obj || {}).filter(Boolean).sort((a, b) => a.localeCompare(b));

export default function Leads() {
  const router = useRouter();
  const [leads, setLeads] = useState(null);
  const [maps, setMaps] = useState({ courses: {}, states: {}, colleges: {}, counsellors: {} });
  const [showImport, setShowImport] = useState(false);

  // filters + sort
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [course, setCourse] = useState('');
  const [stateF, setStateF] = useState('');
  const [college, setCollege] = useState('');
  const [counsellor, setCounsellor] = useState('');
  const [delivered, setDelivered] = useState('');   // '', 'yes', 'no'
  const [minScore, setMinScore] = useState('');
  const [humanOnly, setHumanOnly] = useState(false);
  const [since, setSince] = useState('');           // last active on/after
  const [addedSince, setAddedSince] = useState(''); // created on/after
  const [sortBy, setSortBy] = useState('score_desc');

  const load = useCallback(async () => {
    if (DEMO) { setLeads(demoLeads); return; }
    const { data } = await supabase.from('leads').select('*')
      .order('lead_score', { ascending: false })
      .order('last_active_at', { ascending: false });
    setLeads(data ?? []);
  }, []);

  useEffect(() => { if (!DEMO) fetchCatalogMaps().then(setMaps); }, []);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  const resetFilters = () => {
    setQ(''); setStatus(''); setCourse(''); setStateF(''); setCollege(''); setCounsellor('');
    setDelivered(''); setMinScore(''); setHumanOnly(false); setSince(''); setAddedSince('');
  };

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

  // Filter then sort — recomputed on any filter/sort/data change, no refresh.
  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    const min = minScore ? Number(minScore) : 0;
    const filtered = (leads ?? []).filter((l) =>
      (!status || l.flow_status === status) &&
      (!course || leadCourse(l, maps) === course) &&
      (!stateF || leadState(l, maps) === stateF) &&
      (!college || leadCollege(l, maps) === college) &&
      (!counsellor || String(l.assigned_counsellor_id) === counsellor) &&
      (!delivered || (delivered === 'yes' ? isDelivered(l) : !isDelivered(l))) &&
      (!min || leadScore(l) >= min) &&
      (!humanOnly || l.needs_human) &&
      (!since || (l.last_active_at && new Date(l.last_active_at) >= new Date(since))) &&
      (!addedSince || (l.created_at && new Date(l.created_at) >= new Date(addedSince))) &&
      (!q || (l.name || '').toLowerCase().includes(ql) || l.whatsapp_number.includes(q))
    );
    return filtered.sort((SORTS[sortBy] || SORTS.score_desc).fn);
  }, [leads, maps, q, status, course, stateF, college, counsellor, delivered, minScore, humanOnly, since, addedSince, sortBy]);

  return (
    <div>
      <TopBar />
      <div className="pagehead" style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div><h1 style={{ margin: 0 }}>Leads</h1><span className="sub">{rows.length} of {leads?.length ?? 0} students</span></div>
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => setShowImport(true)}>+ Add leads</button>
      </div>
      <LeadImport open={showImport} onClose={() => setShowImport(false)} onDone={load} />
      <div className="card">
        <div className="filters" style={{ flexWrap: 'wrap', gap: 8, rowGap: 8 }}>
          <input type="text" placeholder="Search name / number…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="">All courses</option>
            {sortedNames(maps.courses).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={stateF} onChange={(e) => setStateF(e.target.value)}>
            <option value="">All states</option>
            {sortedNames(maps.states).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={college} onChange={(e) => setCollege(e.target.value)}>
            <option value="">All colleges</option>
            {sortedNames(maps.colleges).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={counsellor} onChange={(e) => setCounsellor(e.target.value)}>
            <option value="">All counsellors</option>
            {Object.entries(maps.counsellors).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
          <select value={delivered} onChange={(e) => setDelivered(e.target.value)}>
            <option value="">Delivered: any</option>
            <option value="yes">Delivered</option>
            <option value="no">Not delivered</option>
          </select>
          <select value={minScore} onChange={(e) => setMinScore(e.target.value)}>
            <option value="">Any score</option>
            {SCORE_STEPS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
          <label className="sortnote" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Active since
            <input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
          </label>
          <label className="sortnote" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Added since
            <input type="date" value={addedSince} onChange={(e) => setAddedSince(e.target.value)} />
          </label>
          <label className="chk"><input type="checkbox" checked={humanOnly} onChange={(e) => setHumanOnly(e.target.checked)} /> Needs human only</label>
          <label className="sortnote" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Sort by
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </label>
          <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={resetFilters}>Reset</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr>
              <th>Name</th><th>Number</th><th>Temperature</th><th>Score</th><th>Stage</th>
              <th>Course</th><th>State</th><th>College</th><th>Counsellor</th>
              <th>Delivered</th><th>Source</th><th>Last Active</th><th>Needs Human</th><th></th>
            </tr></thead>
            <tbody>
              {leads === null && <tr><td colSpan={14} className="muted">Loading…</td></tr>}
              {rows.length === 0 && leads !== null && <tr><td colSpan={14} className="muted">No leads match.</td></tr>}
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
                    <td><span className={`badge ${isDelivered(l) ? 'yes' : 'no'}`}>{isDelivered(l) ? 'Yes' : 'No'}</span></td>
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

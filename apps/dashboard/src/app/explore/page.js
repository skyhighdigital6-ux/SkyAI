'use client';
// Explore — drill-down browser: State → Colleges → Courses.
// States show a live "Total Colleges" count; click through to a state's
// colleges, then a college's courses. Breadcrumbs + Back + per-level search.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DEMO } from '../../lib/demo';
import TopBar from '../../components/TopBar';

export default function Explore() {
  const [states, setStates] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selState, setSelState] = useState(null);     // { id, name }
  const [selCollege, setSelCollege] = useState(null); // { id, name, course_ids }
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (DEMO) return;
    const [s, g, c] = await Promise.all([
      supabase.from('states').select('id,name,is_active').order('display_order').order('name'),
      supabase.from('colleges').select('id,name,state_id,course_ids,is_active').order('display_order').order('name'),
      supabase.from('courses').select('id,name'),
    ]);
    setStates(s.data ?? []); setColleges(g.data ?? []); setCourses(c.data ?? []);
  }, []);
  // Poll so the "Total Colleges" count updates automatically after add/remove.
  useEffect(() => { load(); const t = setInterval(load, 12000); return () => clearInterval(t); }, [load]);
  useEffect(() => { setQ(''); }, [selState, selCollege]);

  const courseName = (id) => courses.find((c) => c.id === id)?.name;
  const collegeCount = (stateId) => colleges.filter((c) => c.state_id === stateId).length;

  const view = selCollege ? 'courses' : selState ? 'colleges' : 'states';
  const ql = q.trim().toLowerCase();

  const stateRows = states.filter((s) => s.name.toLowerCase().includes(ql));
  const collegeRows = colleges.filter((c) => c.state_id === selState?.id && (c.name || '').toLowerCase().includes(ql));
  const courseRows = (selCollege?.course_ids || []).map(courseName).filter(Boolean)
    .filter((n) => n.toLowerCase().includes(ql)).sort((a, b) => a.localeCompare(b));

  const placeholder = view === 'states' ? 'Search states…'
    : view === 'colleges' ? `Search colleges in ${selState?.name}…` : 'Search courses…';

  const Crumb = ({ onClick, active, children }) => (
    <span onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', color: active ? 'var(--text)' : 'var(--green)', fontWeight: active ? 800 : 600 }}>
      {children}
    </span>
  );

  return (
    <div>
      <TopBar />
      <div className="pagehead">
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Crumb onClick={() => { setSelState(null); setSelCollege(null); }} active={view === 'states'}>States</Crumb>
          {selState && <><span className="muted">›</span><Crumb onClick={() => setSelCollege(null)} active={view === 'colleges'}>{selState.name}</Crumb></>}
          {selCollege && <><span className="muted">›</span><Crumb active>{selCollege.name}</Crumb></>}
        </h1>
        <span className="sub">
          {view === 'states' && `${states.length} states · ${colleges.length} colleges`}
          {view === 'colleges' && `${collegeRows.length} colleges in ${selState.name}`}
          {view === 'courses' && `${(selCollege.course_ids || []).length} courses at ${selCollege.name}`}
        </span>
      </div>

      <div className="card">
        <div className="filters" style={{ marginBottom: 0 }}>
          {view !== 'states' && (
            <button className="btn secondary" onClick={() => (selCollege ? setSelCollege(null) : setSelState(null))}>← Back</button>
          )}
          <input type="text" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          {view === 'states' && (
            <table>
              <thead><tr><th>State</th><th style={{ width: 160 }}>Total Colleges</th><th style={{ width: 60 }}></th></tr></thead>
              <tbody>
                {stateRows.length === 0 && <tr><td colSpan={3} className="muted">No states match.</td></tr>}
                {stateRows.map((s) => (
                  <tr key={s.id} onClick={() => setSelState({ id: s.id, name: s.name })}>
                    <td><b>{s.name}</b>{!s.is_active && <span className="badge cold" style={{ marginLeft: 8 }}>inactive</span>}</td>
                    <td><span className="badge st-blue">{collegeCount(s.id)}</span></td>
                    <td className="muted">›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {view === 'colleges' && (
            <table>
              <thead><tr><th>College</th><th style={{ width: 140 }}>Courses</th><th style={{ width: 60 }}></th></tr></thead>
              <tbody>
                {collegeRows.length === 0 && <tr><td colSpan={3} className="muted">No colleges in this state{ql ? ' match your search' : ''}.</td></tr>}
                {collegeRows.map((c) => (
                  <tr key={c.id} onClick={() => setSelCollege({ id: c.id, name: c.name, course_ids: c.course_ids })}>
                    <td><b>{c.name}</b>{!c.is_active && <span className="badge cold" style={{ marginLeft: 8 }}>inactive</span>}</td>
                    <td><span className="badge st-blue">{(c.course_ids || []).length}</span></td>
                    <td className="muted">›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {view === 'courses' && (
            <table>
              <thead><tr><th style={{ width: 60 }}>#</th><th>Course</th></tr></thead>
              <tbody>
                {courseRows.length === 0 && <tr><td colSpan={2} className="muted">No courses{ql ? ' match your search' : ' listed for this college'}.</td></tr>}
                {courseRows.map((n, i) => (
                  <tr key={n} style={{ cursor: 'default' }}><td className="muted">{i + 1}</td><td>{n}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

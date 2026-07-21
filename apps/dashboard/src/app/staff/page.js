'use client';
// Staff members with dashboard access.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DEMO } from '../../lib/demo';
import TopBar from '../../components/TopBar';

const DEMO_STAFF = [
  { id: 1, full_name: 'Demo Counselor', role: 'admin', created_at: new Date().toISOString() },
];

export default function Staff() {
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    if (DEMO) { setStaff(DEMO_STAFF); return; }
    supabase.from('staff_users').select('*').then(({ data }) => setStaff(data ?? []));
  }, []);

  return (
    <div>
      <TopBar />
      <div className="pagehead"><h1>Staff</h1><span className="sub">{staff.length} members</span></div>
      <div className="card">
        {staff.map((s) => (
          <div key={s.id} className="rowitem" style={{ cursor: 'default' }}>
            <span className="avatar">{(s.full_name || '?')[0].toUpperCase()}</span>
            <span className="nm">{s.full_name}<small>Joined {new Date(s.created_at).toLocaleDateString()}</small></span>
            <span className={`badge ${s.role === 'admin' ? 'st-green' : 'st-blue'}`} style={{ marginLeft: 'auto' }}>{s.role}</span>
          </div>
        ))}
        {!staff.length && <div className="muted">No staff yet.</div>}
      </div>
      <div className="card">
        <h3>➕ How to add a new staff member</h3>
        <div className="setting-row"><span className="avatar sq">1</span><span className="t">Supabase → Authentication → Add user<small>Set email + password and enable &quot;Auto confirm&quot; ✅</small></span></div>
        <div className="setting-row"><span className="avatar sq">2</span><span className="t">Insert a row in staff_users<small>SQL Editor: insert into staff_users (id, full_name, role) values ('&lt;user-uuid&gt;', 'Full Name', 'counselor');</small></span></div>
        <div className="setting-row" style={{ borderBottom: 'none' }}><span className="avatar sq">3</span><span className="t">Done — they can sign in with that email and password<small>role: 'admin' or 'counselor'</small></span></div>
      </div>
    </div>
  );
}

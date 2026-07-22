'use client';
// Edit every field of a lead. Saves directly via the browser Supabase client
// (the leads table has a "staff update" RLS policy). Course/State/College/
// Counsellor are dropdowns from the catalog; the flow status and automation
// toggles are editable too.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeNumber, validNumber } from '../lib/leadUtils';

const STATUSES = ['New Lead', 'Course Selected', 'State Selected', 'College Selected',
  'Documents Shared', 'Guidance Completed', 'Callback Requested', 'Human Assistance Required',
  'Counselor Assigned', 'Not Interested'];

export default function LeadEdit({ lead, open, onClose, onSaved }) {
  const [f, setF] = useState({});
  const [cat, setCat] = useState({ courses: [], states: [], colleges: [], counsellors: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !lead) return;
    setError('');
    setF({
      name: lead.name || '',
      whatsapp_number: lead.whatsapp_number || '',
      selected_course_id: lead.selected_course_id || '',
      selected_state_id: lead.selected_state_id || '',
      selected_college_id: lead.selected_college_id || '',
      assigned_counsellor_id: lead.assigned_counsellor_id || '',
      flow_status: lead.flow_status || '',
      entry_source: lead.entry_source || '',
      needs_human: !!lead.needs_human,
      automation_paused: !!lead.automation_paused,
      opted_out: !!lead.opted_out,
    });
    Promise.all([
      supabase.from('courses').select('id,name').order('display_order'),
      supabase.from('states').select('id,name').order('display_order'),
      supabase.from('colleges').select('id,name').order('name'),
      supabase.from('counsellors').select('id,name').order('display_order'),
    ]).then(([c, s, g, co]) => setCat({ courses: c.data ?? [], states: s.data ?? [], colleges: g.data ?? [], counsellors: co.data ?? [] }));
  }, [open, lead]);

  if (!open || !lead) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const num = normalizeNumber(f.whatsapp_number);
      if (!validNumber(num)) throw new Error('Enter a valid WhatsApp number with country code');
      const payload = {
        name: f.name?.trim() || null,
        whatsapp_number: num,
        selected_course_id: f.selected_course_id || null,
        selected_state_id: f.selected_state_id || null,
        selected_college_id: f.selected_college_id || null,
        assigned_counsellor_id: f.assigned_counsellor_id || null,
        flow_status: f.flow_status || null,
        entry_source: f.entry_source?.trim() || null,
        needs_human: !!f.needs_human,
        automation_paused: !!f.automation_paused,
        opted_out: !!f.opted_out,
        // keep the display consistent: a chosen dropdown clears any typed "other"
        ...(f.selected_course_id ? { other_course: null } : {}),
        ...(f.selected_state_id ? { other_state: null } : {}),
        ...(f.selected_college_id ? { other_college: null } : {}),
      };
      const { error: err } = await supabase.from('leads').update(payload).eq('id', lead.id);
      if (err) throw new Error(err.code === '23505' ? 'Another lead already has this WhatsApp number' : err.message);
      onSaved?.();
      onClose?.();
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  const sel = (k, list, blank = '—') => (
    <select value={f[k] ?? ''} onChange={set(k)}>
      <option value="">{blank}</option>
      {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', zIndex: 50 }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="card" style={{ width: 560, maxWidth: '100%', maxHeight: '86vh', overflow: 'auto', marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Edit lead</h3>
          <button type="button" onClick={onClose} className="btn secondary" style={{ marginLeft: 'auto', padding: '4px 10px' }}>✕</button>
        </div>
        <div className="form-grid">
          <div><label>Name</label><input value={f.name} onChange={set('name')} /></div>
          <div><label>WhatsApp number</label><input value={f.whatsapp_number} onChange={set('whatsapp_number')} /></div>
          <div><label>Course</label>{sel('selected_course_id', cat.courses)}</div>
          <div><label>State</label>{sel('selected_state_id', cat.states)}</div>
          <div><label>College</label>{sel('selected_college_id', cat.colleges)}</div>
          <div><label>Counsellor</label>{sel('assigned_counsellor_id', cat.counsellors)}</div>
          <div><label>Status</label>
            <select value={f.flow_status ?? ''} onChange={set('flow_status')}>
              <option value="">—</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label>Source</label><input value={f.entry_source} onChange={set('entry_source')} /></div>
          <label className="chk"><input type="checkbox" checked={f.needs_human} onChange={set('needs_human')} /> Needs human (bot paused)</label>
          <label className="chk"><input type="checkbox" checked={f.automation_paused} onChange={set('automation_paused')} /> Automation paused</label>
          <label className="chk"><input type="checkbox" checked={f.opted_out} onChange={set('opted_out')} /> Opted out</label>
        </div>
        {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

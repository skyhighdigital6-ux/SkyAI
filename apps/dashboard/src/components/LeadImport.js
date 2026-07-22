'use client';
// Add leads manually (one form) or in bulk (CSV upload/paste). Both post to the
// service-role /api/add-lead route. Course/State are optional and matched to the
// catalog by name for bulk rows.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseCsv, normalizeNumber, validNumber } from '../lib/leadUtils';

const TEMPLATE = 'name,whatsapp_number,course,state\nRahul Sharma,919876543210,MBBS,Bihar\nPriya Verma,9123456789,Engineering,Karnataka\n';

async function authedPost(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/add-lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
  return json;
}

export default function LeadImport({ open, onClose, onDone }) {
  const [tab, setTab] = useState('manual');
  const [courses, setCourses] = useState([]);
  const [states, setStates] = useState([]);
  // manual
  const [form, setForm] = useState({ name: '', whatsapp_number: '', selected_course_id: '', selected_state_id: '' });
  // bulk
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    if (!open) return;
    supabase.from('courses').select('id,name').eq('is_active', true).order('display_order').then(({ data }) => setCourses(data ?? []));
    supabase.from('states').select('id,name').eq('is_active', true).order('display_order').then(({ data }) => setStates(data ?? []));
    setError(''); setResult('');
  }, [open]);

  if (!open) return null;

  const byName = (list, name) => list.find((x) => x.name.toLowerCase() === String(name || '').trim().toLowerCase())?.id ?? null;

  async function submitManual(e) {
    e.preventDefault(); setError(''); setResult(''); setBusy(true);
    try {
      const num = normalizeNumber(form.whatsapp_number);
      if (!validNumber(num)) throw new Error('Enter a valid WhatsApp number with country code (e.g. 91XXXXXXXXXX)');
      await authedPost({
        whatsapp_number: form.whatsapp_number, name: form.name,
        selected_course_id: form.selected_course_id || null,
        selected_state_id: form.selected_state_id || null,
      });
      setResult('Lead added ✓');
      setForm({ name: '', whatsapp_number: '', selected_course_id: '', selected_state_id: '' });
      onDone?.();
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  function loadCsv(text) {
    const parsed = parseCsv(text).map((r) => ({
      name: r.name,
      whatsapp_number: r.whatsapp_number,
      normalized: normalizeNumber(r.whatsapp_number),
      selected_course_id: byName(courses, r.course),
      selected_state_id: byName(states, r.state),
    }));
    setRows(parsed);
    setError(''); setResult('');
  }

  async function submitBulk() {
    setError(''); setResult(''); setBusy(true);
    try {
      if (!rows.length) throw new Error('No rows to import — upload or paste a CSV first');
      const r = await authedPost({ leads: rows });
      setResult(`Imported: ${r.added} added · ${r.skipped} already existed · ${r.invalid} invalid (of ${r.total})`);
      setRows([]);
      onDone?.();
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  const validCount = rows.filter((r) => validNumber(r.normalized)).length;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 560, maxWidth: '100%', maxHeight: '86vh', overflow: 'auto', marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Add leads</h3>
          <button onClick={onClose} className="btn secondary" style={{ marginLeft: 'auto', padding: '4px 10px' }}>✕</button>
        </div>
        <div className="tabs" style={{ marginBottom: 14 }}>
          <button className={tab === 'manual' ? 'active' : ''} onClick={() => { setTab('manual'); setError(''); setResult(''); }}>Add manually</button>
          <button className={tab === 'bulk' ? 'active' : ''} onClick={() => { setTab('bulk'); setError(''); setResult(''); }}>Bulk upload (CSV)</button>
        </div>

        {tab === 'manual' ? (
          <form onSubmit={submitManual}>
            <div className="form-grid">
              <div className="full"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Student name" /></div>
              <div className="full"><label>WhatsApp number *</label><input value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} placeholder="e.g. 919876543210 or 9876543210" /></div>
              <div><label>Course (optional)</label>
                <select value={form.selected_course_id} onChange={(e) => setForm({ ...form, selected_course_id: e.target.value })}>
                  <option value="">—</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label>State (optional)</label>
                <select value={form.selected_state_id} onChange={(e) => setForm({ ...form, selected_state_id: e.target.value })}>
                  <option value="">—</option>{states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
            {result && <div className="muted" style={{ marginTop: 10, color: '#166534' }}>{result}</div>}
            <div style={{ marginTop: 14 }}><button className="btn" disabled={busy}>{busy ? 'Adding…' : 'Add lead'}</button></div>
          </form>
        ) : (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>
              CSV columns: <b>name, whatsapp_number, course, state</b> (course &amp; state optional, matched by name).
              Numbers without a country code are treated as Indian (+91).{' '}
              <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="leads-template.csv" style={{ color: 'var(--green)', fontWeight: 600 }}>Download template</a>
            </p>
            <input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(loadCsv); }} />
            <div className="muted" style={{ margin: '10px 0 4px' }}>…or paste CSV:</div>
            <textarea rows={5} placeholder={TEMPLATE} onChange={(e) => loadCsv(e.target.value)} />
            {rows.length > 0 && (
              <div className="card" style={{ padding: 0, marginTop: 12, maxHeight: 200, overflow: 'auto' }}>
                <table><thead><tr><th>Name</th><th>Number</th><th>Course</th><th>State</th></tr></thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i}>
                        <td>{r.name || '—'}</td>
                        <td style={{ color: validNumber(r.normalized) ? undefined : '#b91c1c' }}>+{r.normalized}{!validNumber(r.normalized) && ' ⚠'}</td>
                        <td>{courses.find((c) => c.id === r.selected_course_id)?.name ?? '—'}</td>
                        <td>{states.find((s) => s.id === r.selected_state_id)?.name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {rows.length > 0 && <div className="muted" style={{ marginTop: 8 }}>{validCount} valid of {rows.length} rows{rows.length > 50 ? ' (showing first 50)' : ''}</div>}
            {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
            {result && <div className="muted" style={{ marginTop: 10, color: '#166534' }}>{result}</div>}
            <div style={{ marginTop: 14 }}><button className="btn" onClick={submitBulk} disabled={busy || !validCount}>{busy ? 'Importing…' : `Import ${validCount || ''} leads`}</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

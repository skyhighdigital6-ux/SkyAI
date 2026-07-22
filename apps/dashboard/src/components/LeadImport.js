'use client';
// Add leads manually (one form) or in bulk (CSV upload/paste). Both post to the
// service-role /api/add-lead route. Course/State are optional and matched to the
// catalog by name for bulk rows.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { backendApi } from '../lib/backendApi';
import { parseCsv, normalizeNumber, validNumber } from '../lib/leadUtils';

const TEMPLATE = 'name,whatsapp_number,course,state\nRahul Sharma,919876543210,MBBS,Bihar\nPriya Verma,9123456789,Engineering,Karnataka\n';

// SheetJS loaded on demand from its CDN (avoids adding a build dependency).
let xlsxPromise = null;
function loadXLSX() {
  if (typeof window !== 'undefined' && window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => reject(new Error('Failed to load the Excel library'));
      document.head.appendChild(s);
    });
  }
  return xlsxPromise;
}

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
  const [sendWelcome, setSendWelcome] = useState(true);

  useEffect(() => {
    if (!open) return;
    supabase.from('courses').select('id,name').eq('is_active', true).order('display_order').then(({ data }) => setCourses(data ?? []));
    supabase.from('states').select('id,name').eq('is_active', true).order('display_order').then(({ data }) => setStates(data ?? []));
    // Reset the form each time the modal opens so a previous lead's details
    // don't linger.
    setForm({ name: '', whatsapp_number: '', selected_course_id: '', selected_state_id: '' });
    setRows([]);
    setError(''); setResult('');
  }, [open]);

  if (!open) return null;

  const byName = (list, name) => list.find((x) => x.name.toLowerCase() === String(name || '').trim().toLowerCase())?.id ?? null;

  async function submitManual(e) {
    e.preventDefault(); setError(''); setResult(''); setBusy(true);
    try {
      const num = normalizeNumber(form.whatsapp_number);
      if (!validNumber(num)) throw new Error('Enter a valid WhatsApp number with country code (e.g. 91XXXXXXXXXX)');
      const { id } = await authedPost({
        whatsapp_number: form.whatsapp_number, name: form.name,
        selected_course_id: form.selected_course_id || null,
        selected_state_id: form.selected_state_id || null,
      });
      if (sendWelcome && id) {
        try { await backendApi(`/leads/${id}/start`, { method: 'POST' }); }
        catch (werr) {
          // Lead is created; only the WhatsApp welcome failed — keep the modal open to say so.
          onDone?.();
          setError(`Lead added, but welcome message not sent: ${werr.message}`);
          setBusy(false);
          return;
        }
      }
      onDone?.();
      onClose?.();                 // close automatically on success
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  // Map parsed rows [{name, whatsapp_number, course, state}] → preview rows.
  function setPreview(parsed) {
    setRows(parsed.map((r) => ({
      name: r.name,
      whatsapp_number: String(r.whatsapp_number ?? ''),
      normalized: normalizeNumber(r.whatsapp_number),
      selected_course_id: byName(courses, r.course),
      selected_state_id: byName(states, r.state),
    })).filter((r) => r.whatsapp_number));
    setError(''); setResult('');
  }
  const loadCsv = (text) => setPreview(parseCsv(text));

  // Read an uploaded Excel (.xlsx/.xls) or CSV file into the preview.
  async function loadFile(file) {
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.csv')) { setPreview(parseCsv(await file.text())); return; }
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const get = (row, keys) => { for (const k of Object.keys(row)) if (keys.includes(k.trim().toLowerCase())) return row[k]; return ''; };
      setPreview(json.map((r) => ({
        name: get(r, ['name', 'student', 'student_name']),
        whatsapp_number: get(r, ['whatsapp_number', 'number', 'phone', 'mobile', 'whatsapp']),
        course: get(r, ['course']), state: get(r, ['state']),
      })));
    } catch (err) { setError(`Could not read that Excel file: ${err.message}`); }
  }

  async function downloadSampleExcel() {
    try {
      const XLSX = await loadXLSX();
      const ws = XLSX.utils.aoa_to_sheet([
        ['name', 'whatsapp_number', 'course', 'state'],
        ['Rahul Sharma', '919876543210', 'MBBS', 'Bihar'],
        ['Priya Verma', '9123456789', 'Engineering', 'Karnataka'],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Leads');
      XLSX.writeFile(wb, 'leads-sample.xlsx');
    } catch (err) { setError(`Could not generate the sample: ${err.message}`); }
  }

  async function submitBulk() {
    setError(''); setResult(''); setBusy(true);
    try {
      if (!rows.length) throw new Error('No rows to import — upload or paste a CSV first');
      const r = await authedPost({ leads: rows });
      let note = `Imported: ${r.added} added · ${r.skipped} already existed · ${r.invalid} invalid (of ${r.total})`;
      if (sendWelcome && r.ids?.length) {
        try {
          const s = await backendApi('/leads/start-bulk', { method: 'POST', body: { ids: r.ids } });
          note += ` · welcome queued to ${s.queued}`;
        } catch (werr) {
          note += ` · welcome NOT sent: ${werr.message}`;
        }
      }
      setResult(note);
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
          <button className={tab === 'bulk' ? 'active' : ''} onClick={() => { setTab('bulk'); setError(''); setResult(''); }}>Bulk upload (Excel)</button>
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
            <label className="chk" style={{ marginTop: 12 }}><input type="checkbox" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} /> Send welcome message on WhatsApp now</label>
            <div style={{ marginTop: 12 }}><button className="btn" disabled={busy}>{busy ? 'Adding…' : 'Add lead'}</button></div>
          </form>
        ) : (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>
              Excel (.xlsx) or CSV columns: <b>name, whatsapp_number, course, state</b> (course &amp; state optional, matched by name).
              Numbers without a country code are treated as Indian (+91).{' '}
              <span className="linky" onClick={downloadSampleExcel} style={{ color: 'var(--green)', fontWeight: 600 }}>Download sample Excel</span>
            </p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => loadFile(e.target.files?.[0])} />
            <div className="muted" style={{ margin: '10px 0 4px' }}>…or paste rows (CSV):</div>
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
            <label className="chk" style={{ marginTop: 12 }}><input type="checkbox" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} /> Send welcome message on WhatsApp now (staggered)</label>
            <div style={{ marginTop: 12 }}><button className="btn" onClick={submitBulk} disabled={busy || !validCount}>{busy ? 'Importing…' : `Import ${validCount || ''} leads`}</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

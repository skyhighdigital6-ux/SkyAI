'use client';
// Voice campaign detail — upload contacts (Excel/CSV), start/pause the dialer,
// live stats, and every call with its transcript / recording.
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { DEMO } from '../../../lib/demo';
import { parseCsv, normalizeNumber, validNumber } from '../../../lib/leadUtils';
import TopBar from '../../../components/TopBar';

const CALL_CLS = {
  queued: 'st-gray', ringing: 'st-blue', in_progress: 'st-blue', completed: 'st-green',
  transferred: 'st-teal', failed: 'st-red', no_answer: 'st-amber', busy: 'st-amber', voicemail: 'st-purple',
};
const SAMPLE = 'name,phone\nRahul Sharma,919876543210\nPriya Verma,9123456789\n';

// SheetJS on demand (same approach as the lead importer).
let xlsxPromise = null;
function loadXLSX() {
  if (typeof window !== 'undefined' && window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.onload = () => resolve(window.XLSX); s.onerror = () => reject(new Error('Failed to load the Excel library'));
      document.head.appendChild(s);
    });
  }
  return xlsxPromise;
}

export default function VoiceCampaign() {
  const { id } = useParams();
  const router = useRouter();
  const [c, setC] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [calls, setCalls] = useState([]);
  const [rows, setRows] = useState([]);      // parsed upload preview
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(null);    // call whose transcript is expanded

  const load = useCallback(async () => {
    if (DEMO) return;
    const [a, b, d] = await Promise.all([
      supabase.from('voice_campaigns').select('*').eq('id', id).maybeSingle(),
      supabase.from('voice_contacts').select('*').eq('campaign_id', id).order('id'),
      supabase.from('voice_calls').select('*').eq('campaign_id', id).order('created_at', { ascending: false }).limit(300),
    ]);
    setC(a.data ?? null); setContacts(b.data ?? []); setCalls(d.data ?? []);
  }, [id]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  function preview(parsed) {
    setRows(parsed.map((r) => ({ name: r.name || '', phone: normalizeNumber(r.phone || r.whatsapp_number || r.number) }))
      .filter((r) => r.phone));
    setErr(''); setNote('');
  }
  async function onFile(file) {
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.csv')) return preview(parseCsv(await file.text()));
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const get = (row, keys) => { for (const k of Object.keys(row)) if (keys.includes(k.trim().toLowerCase())) return row[k]; return ''; };
      preview(json.map((r) => ({ name: get(r, ['name', 'student', 'student_name']), phone: String(get(r, ['phone', 'number', 'mobile', 'whatsapp_number', 'whatsapp'])) })));
    } catch (e) { setErr(`Could not read that Excel file: ${e.message}`); }
  }
  async function downloadSample() {
    try {
      const XLSX = await loadXLSX();
      const ws = XLSX.utils.aoa_to_sheet([['name', 'phone'], ['Rahul Sharma', '919876543210'], ['Priya Verma', '9123456789']]);
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
      XLSX.writeFile(wb, 'voice-contacts-sample.xlsx');
    } catch (e) { setErr(e.message); }
  }

  async function importContacts() {
    setBusy(true); setErr(''); setNote('');
    try {
      const valid = rows.filter((r) => validNumber(r.phone));
      if (!valid.length) throw new Error('No valid phone numbers found');
      const have = new Set(contacts.map((x) => x.phone));
      const fresh = valid.filter((r) => !have.has(r.phone));
      if (fresh.length) {
        const { error } = await supabase.from('voice_contacts')
          .insert(fresh.map((r) => ({ campaign_id: Number(id), name: r.name || null, phone: r.phone })));
        if (error) throw new Error(error.message);
      }
      setNote(`Imported ${fresh.length} · skipped ${valid.length - fresh.length} duplicate · ${rows.length - valid.length} invalid`);
      setRows([]); load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function setStatus(status) {
    setBusy(true); setErr('');
    const patch = { status };
    if (status === 'running' && !c?.started_at) patch.started_at = new Date().toISOString();
    const { error } = await supabase.from('voice_campaigns').update(patch).eq('id', id);
    if (error) setErr(error.message);
    setBusy(false); load();
  }

  if (!c) return <div><TopBar /><div className="muted">Loading…</div></div>;

  const stat = (s) => contacts.filter((x) => x.status === s).length;
  const done = calls.filter((x) => x.status === 'completed').length;
  const answeredPct = calls.length ? Math.round((done / calls.length) * 100) : 0;
  const avgSec = (() => { const d = calls.filter((x) => x.duration_seconds); return d.length ? Math.round(d.reduce((a, b) => a + b.duration_seconds, 0) / d.length) : 0; })();

  return (
    <div>
      <TopBar />
      <div className="pagehead" style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0 }}>{c.name}</h1>
          <span className="sub">{c.direction} · <span className={`badge ${c.status === 'running' ? 'st-green' : 'st-gray'}`}>{c.status}</span> · {c.concurrency} concurrent · {String(c.call_window_start).slice(0, 5)}–{String(c.call_window_end).slice(0, 5)}</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn secondary" onClick={() => router.push('/voice')}>← All campaigns</button>
          {c.status === 'running'
            ? <button className="btn secondary" disabled={busy} onClick={() => setStatus('paused')}>⏸ Pause</button>
            : <button className="btn" disabled={busy || !contacts.length} onClick={() => setStatus('running')}>▶ Start calling</button>}
        </div>
      </div>
      {err && <div className="banner red">{err}</div>}

      <div className="stats">
        <div className="stat"><div><div className="lbl">Contacts</div><div className="num">{contacts.length}</div></div></div>
        <div className="stat"><div><div className="lbl">Pending</div><div className="num">{stat('pending')}</div></div></div>
        <div className="stat"><div><div className="lbl">Calls made</div><div className="num">{calls.length}</div></div></div>
        <div className="stat"><div><div className="lbl">Answered</div><div className="num">{answeredPct}%</div></div></div>
        <div className="stat"><div><div className="lbl">Avg duration</div><div className="num">{avgSec ? `${avgSec}s` : '—'}</div></div></div>
      </div>

      <div className="card">
        <h3>Upload contacts</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Excel (.xlsx) or CSV with columns <b>name, phone</b>. Numbers without a country code are treated as Indian (+91).{' '}
          <span className="linky" onClick={downloadSample} style={{ fontWeight: 600 }}>Download sample Excel</span>
        </p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFile(e.target.files?.[0])} />
        <div className="muted" style={{ margin: '10px 0 4px' }}>…or paste rows (CSV):</div>
        <textarea rows={4} placeholder={SAMPLE} onChange={(e) => preview(parseCsv(e.target.value))} />
        {rows.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="muted">{rows.filter((r) => validNumber(r.phone)).length} valid of {rows.length} rows</div>
            <button className="btn" style={{ marginTop: 8 }} disabled={busy} onClick={importContacts}>{busy ? 'Importing…' : `Import ${rows.filter((r) => validNumber(r.phone)).length} contacts`}</button>
          </div>
        )}
        {note && <div className="muted" style={{ marginTop: 10, color: '#166534' }}>{note}</div>}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <h3 style={{ padding: '16px 16px 0' }}>Calls ({calls.length})</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>To</th><th>Status</th><th>Duration</th><th>Sentiment</th><th>Summary</th><th>Recording</th><th>When</th></tr></thead>
            <tbody>
              {calls.length === 0 && <tr><td colSpan={7} className="muted">No calls yet. Upload contacts and press “Start calling”.</td></tr>}
              {calls.map((k) => (
                <tr key={k.id} onClick={() => setOpen(open?.id === k.id ? null : k)}>
                  <td>+{k.to_number}</td>
                  <td><span className={`badge ${CALL_CLS[k.status] ?? 'st-gray'}`}>{k.status}</span></td>
                  <td>{k.duration_seconds ? `${k.duration_seconds}s` : '—'}</td>
                  <td className="muted">{k.sentiment || '—'}</td>
                  <td className="muted">{(k.summary || '').slice(0, 60) || '—'}</td>
                  <td>{k.recording_url ? <a href={k.recording_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--green)', fontWeight: 600 }}>▶ Play</a> : '—'}</td>
                  <td className="muted">{new Date(k.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {open && (
          <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
            <b>Transcript — +{open.to_number}</b>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, marginTop: 8 }}>{open.transcript || 'No transcript recorded for this call.'}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';
// Knowledge-base editor — forms (not raw JSON) for the 4 kb_* tables.
// The universities list is the one nested field; it gets a JSON textarea.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DEMO, demoKb } from '../../lib/demo';
import TopBar from '../../components/TopBar';

const TABLES = {
  kb_countries: {
    label: 'Countries',
    fields: [
      { name: 'country', label: 'ID (e.g. russia)', required: true },
      { name: 'display_name', label: 'Display name', required: true },
      { name: 'total_fee_range', label: 'Total fee range' },
      { name: 'duration', label: 'Duration' },
      { name: 'eligibility', label: 'Eligibility', textarea: true },
      { name: 'recognition', label: 'Recognition' },
      { name: 'language', label: 'Language of instruction' },
      { name: 'living_costs', label: 'Living costs', textarea: true },
      { name: 'pros', label: 'Pros', textarea: true },
      { name: 'cons', label: 'Cons', textarea: true },
      { name: 'counselling_notes', label: 'Counselling notes', textarea: true },
      { name: 'brochure_path', label: 'Brochure path (in brochures bucket)' },
      { name: 'universities', label: 'Universities (JSON list)', json: true },
      { name: 'is_active', label: 'Active', bool: true },
    ],
    title: (r) => r.display_name,
  },
  kb_courses: {
    label: 'Courses',
    fields: [
      { name: 'course', label: 'ID (e.g. mbbs)', required: true },
      { name: 'display_name', label: 'Display name', required: true },
      { name: 'eligibility', label: 'Eligibility', textarea: true, required: true },
      { name: 'notes', label: 'Notes', textarea: true },
      { name: 'is_active', label: 'Active', bool: true },
    ],
    title: (r) => r.display_name,
  },
  kb_faqs: {
    label: 'FAQs',
    fields: [
      { name: 'question', label: 'Question', required: true },
      { name: 'answer', label: 'Answer', textarea: true, required: true },
      { name: 'category', label: 'Category' },
      { name: 'is_active', label: 'Active', bool: true },
    ],
    title: (r) => r.question,
  },
  kb_process_steps: {
    label: 'Process steps',
    fields: [
      { name: 'step_number', label: 'Step #', number: true, required: true },
      { name: 'title', label: 'Title', required: true },
      { name: 'description', label: 'Description', textarea: true, required: true },
    ],
    title: (r) => `${r.step_number}. ${r.title}`,
  },
};

function Editor({ table, row, onDone }) {
  const cfg = TABLES[table];
  const [form, setForm] = useState(() => {
    const f = {};
    for (const field of cfg.fields) {
      const v = row?.[field.name];
      f[field.name] = field.json ? JSON.stringify(v ?? [], null, 2) : field.bool ? (v ?? true) : (v ?? '');
    }
    return f;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    if (DEMO) { alert('Demo mode — knowledge base edits will be saved once Supabase is connected.'); onDone(false); return; }
    setBusy(true);
    setError('');
    const payload = {};
    try {
      for (const field of cfg.fields) {
        let v = form[field.name];
        if (field.json) v = JSON.parse(v || '[]');
        if (field.number) v = Number(v);
        if (!field.bool && !field.json && typeof v === 'string' && !v.trim()) v = null;
        if (field.required && (v === null || v === '')) throw new Error(`${field.label} is required`);
        payload[field.name] = v;
      }
    } catch (err) {
      setError(err.message.startsWith('Unexpected') ? 'Universities: invalid JSON' : err.message);
      setBusy(false);
      return;
    }
    const q = row
      ? supabase.from(table).update(payload).eq('id', row.id)
      : supabase.from(table).insert(payload);
    const { error: dbErr } = await q;
    if (dbErr) setError(dbErr.message);
    else onDone(true);
    setBusy(false);
  }

  return (
    <form className="card" onSubmit={save}>
      <div className="form-grid">
        {cfg.fields.map((field) => (
          <div key={field.name} className={field.textarea || field.json ? 'full' : ''}>
            <label>{field.label}</label>
            {field.bool ? (
              <input type="checkbox" checked={!!form[field.name]}
                onChange={(e) => setForm({ ...form, [field.name]: e.target.checked })} />
            ) : field.textarea || field.json ? (
              <textarea value={form[field.name]} rows={field.json ? 6 : 3}
                onChange={(e) => setForm({ ...form, [field.name]: e.target.value })} />
            ) : (
              <input type={field.number ? 'number' : 'text'} value={form[field.name]}
                onChange={(e) => setForm({ ...form, [field.name]: e.target.value })} />
            )}
          </div>
        ))}
      </div>
      {error && <div className="err" style={{ marginTop: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : row ? 'Save changes' : 'Add'}</button>
        <button type="button" className="btn secondary" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </form>
  );
}

export default function KbPage() {
  const [table, setTable] = useState('kb_countries');
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | row

  const load = useCallback(async () => {
    if (DEMO) { setRows(demoKb[table] ?? []); return; }
    const { data } = await supabase.from(table).select('*').order('id');
    setRows(data ?? []);
  }, [table]);

  useEffect(() => { setEditing(null); load(); }, [load]);

  async function remove(row) {
    if (DEMO) { alert('Demo mode — knowledge base edits will be saved once Supabase is connected.'); return; }
    if (!confirm('Delete this entry?')) return;
    await supabase.from(table).delete().eq('id', row.id);
    load();
  }

  const cfg = TABLES[table];
  return (
    <div>
      <TopBar />
      <div className="pagehead"><h1>Knowledge Base</h1><span className="sub">The bot answers strictly from the facts stored here</span></div>
      <div className="tabs">
        {Object.entries(TABLES).map(([key, t]) => (
          <button key={key} className={table === key ? 'active' : ''} onClick={() => setTable(key)}>{t.label}</button>
        ))}
      </div>

      {editing ? (
        <Editor table={table} row={editing === 'new' ? null : editing}
          onDone={(saved) => { setEditing(null); if (saved) load(); }} />
      ) : (
        <button className="btn" style={{ marginBottom: 14 }} onClick={() => setEditing('new')}>+ Add {cfg.label.replace(/s$/, '').toLowerCase()}</button>
      )}

      <div className="card" style={{ padding: 0 }}><table>
        <thead><tr><th>Entry</th><th style={{ width: 160 }}>Actions</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={2} className="muted">Empty.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} style={{ cursor: 'default' }}>
              <td>
                {cfg.title(r)}
                {'is_active' in r && !r.is_active && <span className="badge cold" style={{ marginLeft: 8 }}>inactive</span>}
              </td>
              <td>
                <button className="btn secondary" style={{ marginRight: 6 }} onClick={() => setEditing(r)}>Edit</button>
                <button className="btn danger" onClick={() => remove(r)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

'use client';
// Admission-flow Catalog — the admin-managed data the WhatsApp menu flow reads:
// Courses, States, Colleges (course/state mapping), per-college Documents
// (brochure / fee structure, uploaded as PDFs), Counsellors (with photo), and
// global Settings (Instagram handle). Add/edit/activate/reorder here and it
// appears in the bot with no code change. Inactive rows are hidden from students.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DEMO } from '../../lib/demo';
import TopBar from '../../components/TopBar';

const TABS = ['Courses', 'States', 'Colleges', 'Documents', 'Counsellors', 'Settings'];
const DOC_TYPES = [
  { id: 'brochure', label: 'Brochure' },
  { id: 'fee_structure', label: 'Fee Structure' },
  { id: 'other', label: 'Other admission document' },
];

async function uploadFile(bucket, folder, file) {
  const ext = file.name.split('.').pop();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { path, name: file.name };
}

function Field({ label, children, full }) {
  return <div className={full ? 'full' : ''}><label>{label}</label>{children}</div>;
}

// ── Simple name/active/order tables (Courses, States) ────────────────
function SimpleTable({ table, singular }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null); // null | {name, display_order, is_active, id?}
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (DEMO) return setRows([]);
    const { data } = await supabase.from(table).select('*').order('display_order').order('id');
    setRows(data ?? []);
  }, [table]);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault(); setErr('');
    if (DEMO) return alert('Connect Supabase to edit the catalog.');
    if (!form.name?.trim()) return setErr('Name is required');
    const payload = { name: form.name.trim(), display_order: Number(form.display_order) || 0, is_active: form.is_active ?? true };
    const q = form.id ? supabase.from(table).update(payload).eq('id', form.id) : supabase.from(table).insert(payload);
    const { error } = await q;
    if (error) return setErr(error.message);
    setForm(null); load();
  }
  async function remove(r) {
    if (DEMO) return; if (!confirm(`Delete "${r.name}"?`)) return;
    await supabase.from(table).delete().eq('id', r.id); load();
  }

  return (
    <div>
      {form ? (
        <form className="card" onSubmit={save}>
          <div className="form-grid">
            <Field label={`${singular} name`}><input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Display order"><input type="number" value={form.display_order ?? 0} onChange={(e) => setForm({ ...form, display_order: e.target.value })} /></Field>
            <Field label="Active"><input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /></Field>
          </div>
          {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn">{form.id ? 'Save' : 'Add'}</button>
            <button type="button" className="btn secondary" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn" style={{ marginBottom: 14 }} onClick={() => setForm({ is_active: true, display_order: 0 })}>+ Add {singular.toLowerCase()}</button>
      )}
      <div className="card" style={{ padding: 0 }}><table>
        <thead><tr><th>{singular}</th><th style={{ width: 90 }}>Order</th><th style={{ width: 160 }}>Actions</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3} className="muted">Empty.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name} {!r.is_active && <span className="badge cold" style={{ marginLeft: 8 }}>inactive</span>}</td>
              <td>{r.display_order}</td>
              <td>
                <button className="btn secondary" style={{ marginRight: 6 }} onClick={() => setForm(r)}>Edit</button>
                <button className="btn danger" onClick={() => remove(r)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

// ── Colleges (state dropdown + course multi-select) ──────────────────
function Colleges() {
  const [rows, setRows] = useState([]);
  const [states, setStates] = useState([]);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (DEMO) return;
    const [c, s, g] = await Promise.all([
      supabase.from('courses').select('*').order('display_order'),
      supabase.from('states').select('*').order('display_order'),
      supabase.from('colleges').select('*').order('display_order').order('id'),
    ]);
    setCourses(c.data ?? []); setStates(s.data ?? []); setRows(g.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const stateName = (id) => states.find((s) => s.id === id)?.name ?? '—';
  const courseNames = (ids) => (ids || []).map((id) => courses.find((c) => c.id === id)?.name).filter(Boolean).join(', ') || '—';

  async function save(e) {
    e.preventDefault(); setErr('');
    if (DEMO) return alert('Connect Supabase to edit the catalog.');
    if (!form.name?.trim()) return setErr('College name is required');
    const payload = {
      name: form.name.trim(),
      state_id: form.state_id ? Number(form.state_id) : null,
      course_ids: (form.course_ids || []).map(Number),
      display_order: Number(form.display_order) || 0,
      is_active: form.is_active ?? true,
    };
    const q = form.id ? supabase.from('colleges').update(payload).eq('id', form.id) : supabase.from('colleges').insert(payload);
    const { error } = await q;
    if (error) return setErr(error.message);
    setForm(null); load();
  }
  async function remove(r) {
    if (DEMO) return; if (!confirm(`Delete "${r.name}"?`)) return;
    await supabase.from('colleges').delete().eq('id', r.id); load();
  }
  const toggleCourse = (id) => {
    const set = new Set(form.course_ids || []);
    set.has(id) ? set.delete(id) : set.add(id);
    setForm({ ...form, course_ids: [...set] });
  };

  return (
    <div>
      {form ? (
        <form className="card" onSubmit={save}>
          <div className="form-grid">
            <Field label="College name" full><input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="State">
              <select value={form.state_id || ''} onChange={(e) => setForm({ ...form, state_id: e.target.value })}>
                <option value="">— select state —</option>
                {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Display order"><input type="number" value={form.display_order ?? 0} onChange={(e) => setForm({ ...form, display_order: e.target.value })} /></Field>
            <Field label="Courses offered" full>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {courses.length === 0 && <span className="muted">Add courses first.</span>}
                {courses.map((c) => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={(form.course_ids || []).includes(c.id)} onChange={() => toggleCourse(c.id)} /> {c.name}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Active"><input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /></Field>
          </div>
          {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn">{form.id ? 'Save' : 'Add'}</button>
            <button type="button" className="btn secondary" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn" style={{ marginBottom: 14 }} onClick={() => setForm({ is_active: true, display_order: 0, course_ids: [] })}>+ Add college</button>
      )}
      <div className="card" style={{ padding: 0 }}><table>
        <thead><tr><th>College</th><th>State</th><th>Courses</th><th style={{ width: 160 }}>Actions</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} className="muted">Empty.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name} {!r.is_active && <span className="badge cold" style={{ marginLeft: 8 }}>inactive</span>}</td>
              <td>{stateName(r.state_id)}</td>
              <td className="muted">{courseNames(r.course_ids)}</td>
              <td>
                <button className="btn secondary" style={{ marginRight: 6 }} onClick={() => setForm({ ...r, course_ids: r.course_ids || [] })}>Edit</button>
                <button className="btn danger" onClick={() => remove(r)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

// ── College documents (PDF upload, versioned by academic year) ───────
function Documents() {
  const [rows, setRows] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (DEMO) return;
    const [d, g] = await Promise.all([
      supabase.from('college_documents').select('*').order('uploaded_at', { ascending: false }),
      supabase.from('colleges').select('id, name').order('name'),
    ]);
    setRows(d.data ?? []); setColleges(g.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const collegeName = (id) => colleges.find((c) => c.id === id)?.name ?? '—';

  async function save(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (DEMO) throw new Error('Connect Supabase to upload documents.');
      if (!form.college_id) throw new Error('Select a college');
      let storage_path = form.storage_path, file_name = form.file_name;
      if (file) {
        const up = await uploadFile('brochures', `documents/${form.college_id}`, file);
        storage_path = up.path; file_name = file.name;
      }
      if (!storage_path) throw new Error('Choose a PDF to upload');
      const payload = {
        college_id: Number(form.college_id), doc_type: form.doc_type || 'brochure',
        academic_year: form.academic_year?.trim() || null, storage_path, file_name,
        is_active: form.is_active ?? true,
      };
      const q = form.id ? supabase.from('college_documents').update(payload).eq('id', form.id) : supabase.from('college_documents').insert(payload);
      const { error } = await q;
      if (error) throw new Error(error.message);
      setForm(null); setFile(null); load();
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }
  async function remove(r) {
    if (DEMO) return; if (!confirm('Delete this document?')) return;
    await supabase.from('college_documents').delete().eq('id', r.id); load();
  }

  return (
    <div>
      {form ? (
        <form className="card" onSubmit={save}>
          <div className="form-grid">
            <Field label="College">
              <select value={form.college_id || ''} onChange={(e) => setForm({ ...form, college_id: e.target.value })}>
                <option value="">— select college —</option>
                {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Document type">
              <select value={form.doc_type || 'brochure'} onChange={(e) => setForm({ ...form, doc_type: e.target.value })}>
                {DOC_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </Field>
            <Field label="Academic session (e.g. 2026-27)"><input value={form.academic_year || ''} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} /></Field>
            <Field label="Active"><input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /></Field>
            <Field label={form.storage_path ? 'Replace PDF (optional)' : 'PDF file'} full>
              <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {form.file_name && <div className="muted" style={{ marginTop: 4 }}>Current: {form.file_name}</div>}
            </Field>
          </div>
          {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : form.id ? 'Save' : 'Upload'}</button>
            <button type="button" className="btn secondary" onClick={() => { setForm(null); setFile(null); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn" style={{ marginBottom: 14 }} onClick={() => setForm({ is_active: true, doc_type: 'brochure' })}>+ Add document</button>
      )}
      <div className="card" style={{ padding: 0 }}><table>
        <thead><tr><th>College</th><th>Type</th><th>Session</th><th style={{ width: 160 }}>Actions</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} className="muted">Empty.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{collegeName(r.college_id)} {!r.is_active && <span className="badge cold" style={{ marginLeft: 8 }}>inactive</span>}</td>
              <td>{DOC_TYPES.find((d) => d.id === r.doc_type)?.label ?? r.doc_type}</td>
              <td className="muted">{r.academic_year || '—'}</td>
              <td>
                <button className="btn secondary" style={{ marginRight: 6 }} onClick={() => setForm(r)}>Edit</button>
                <button className="btn danger" onClick={() => remove(r)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

// ── Counsellors (photo upload) ───────────────────────────────────────
function Counsellors() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (DEMO) return;
    const { data } = await supabase.from('counsellors').select('*').order('display_order').order('id');
    setRows(data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (DEMO) throw new Error('Connect Supabase to edit counsellors.');
      if (!form.name?.trim()) throw new Error('Name is required');
      let photo_path = form.photo_path;
      if (file) { const up = await uploadFile('counsellor-photos', 'photos', file); photo_path = up.path; }
      const payload = {
        name: form.name.trim(), title: form.title?.trim() || null, phone: form.phone?.trim() || null,
        instagram: form.instagram?.trim() || null, photo_path,
        is_default_callback: form.is_default_callback ?? false,
        is_active: form.is_active ?? true, display_order: Number(form.display_order) || 0,
      };
      const q = form.id ? supabase.from('counsellors').update(payload).eq('id', form.id) : supabase.from('counsellors').insert(payload);
      const { error } = await q;
      if (error) throw new Error(error.message);
      setForm(null); setFile(null); load();
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }
  async function remove(r) {
    if (DEMO) return; if (!confirm(`Delete "${r.name}"?`)) return;
    await supabase.from('counsellors').delete().eq('id', r.id); load();
  }

  return (
    <div>
      {form ? (
        <form className="card" onSubmit={save}>
          <div className="form-grid">
            <Field label="Name"><input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Title (e.g. Career Expert)"><input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Call/WhatsApp number"><input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Instagram handle"><input value={form.instagram || ''} onChange={(e) => setForm({ ...form, instagram: e.target.value })} /></Field>
            <Field label="Display order"><input type="number" value={form.display_order ?? 0} onChange={(e) => setForm({ ...form, display_order: e.target.value })} /></Field>
            <Field label="Default for callbacks"><input type="checkbox" checked={form.is_default_callback ?? false} onChange={(e) => setForm({ ...form, is_default_callback: e.target.checked })} /></Field>
            <Field label="Active"><input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /></Field>
            <Field label={form.photo_path ? 'Replace photo (optional)' : 'Profile photo'} full>
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {form.photo_path && <div className="muted" style={{ marginTop: 4 }}>A photo is already set.</div>}
            </Field>
          </div>
          {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : form.id ? 'Save' : 'Add'}</button>
            <button type="button" className="btn secondary" onClick={() => { setForm(null); setFile(null); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn" style={{ marginBottom: 14 }} onClick={() => setForm({ is_active: true, display_order: 0 })}>+ Add counsellor</button>
      )}
      <div className="card" style={{ padding: 0 }}><table>
        <thead><tr><th>Counsellor</th><th>Phone</th><th style={{ width: 160 }}>Actions</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3} className="muted">Empty.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}{r.title ? ` — ${r.title}` : ''} {r.is_default_callback && <span className="badge hot" style={{ marginLeft: 8 }}>callback</span>} {!r.is_active && <span className="badge cold" style={{ marginLeft: 8 }}>inactive</span>}</td>
              <td className="muted">{r.phone || '—'}</td>
              <td>
                <button className="btn secondary" style={{ marginRight: 6 }} onClick={() => setForm(r)}>Edit</button>
                <button className="btn danger" onClick={() => remove(r)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

// ── Global settings (Instagram handle) ───────────────────────────────
function Settings() {
  const [handle, setHandle] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (DEMO) return;
    supabase.from('app_settings').select('value').eq('key', 'instagram_handle').maybeSingle()
      .then(({ data }) => setHandle(data?.value ?? ''));
  }, []);
  async function save(e) {
    e.preventDefault();
    if (DEMO) return alert('Connect Supabase to edit settings.');
    await supabase.from('app_settings').upsert({ key: 'instagram_handle', value: handle.trim() });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  return (
    <form className="card" onSubmit={save} style={{ maxWidth: 480 }}>
      <div className="form-grid">
        <Field label="Instagram handle (without @)" full>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="skyhigheducationalservices" />
        </Field>
      </div>
      <div style={{ marginTop: 12 }}><button className="btn">Save</button>{saved && <span className="muted" style={{ marginLeft: 10 }}>Saved ✓</span>}</div>
    </form>
  );
}

export default function CatalogPage() {
  const [tab, setTab] = useState('Courses');
  return (
    <div>
      <TopBar />
      <div className="pagehead"><h1>Catalog</h1><span className="sub">Courses, states, colleges, documents & experts shown in the WhatsApp flow</span></div>
      {DEMO && <div className="banner" style={{ marginBottom: 12 }}>Demo mode — connect Supabase to manage the catalog.</div>}
      <div className="tabs">
        {TABS.map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'Courses' && <SimpleTable table="courses" singular="Course" />}
      {tab === 'States' && <SimpleTable table="states" singular="State" />}
      {tab === 'Colleges' && <Colleges />}
      {tab === 'Documents' && <Documents />}
      {tab === 'Counsellors' && <Counsellors />}
      {tab === 'Settings' && <Settings />}
    </div>
  );
}

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
        <thead><tr><th style={{ width: 80 }}>Order</th><th>{singular}</th><th style={{ width: 160 }}>Actions</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3} className="muted">Empty.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.display_order}</td>
              <td>{r.name} {!r.is_active && <span className="badge cold" style={{ marginLeft: 8 }}>inactive</span>}</td>
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
  const [form, setForm] = useState(null);       // single EDIT form
  const [creating, setCreating] = useState(null); // multi-add form
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (DEMO) return;
    const [c, s, g] = await Promise.all([
      supabase.from('courses').select('*').order('display_order').order('id'),
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
    if (DEMO) return alert('Connect Supabase to edit the catalogue.');
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

  // ── multi-add helpers ──
  const cSetName = (i, v) => setCreating((c) => ({ ...c, names: c.names.map((n, idx) => (idx === i ? v : n)) }));
  const cAddName = () => setCreating((c) => ({ ...c, names: [...c.names, ''] }));
  const cRemoveName = (i) => setCreating((c) => ({ ...c, names: c.names.filter((_, idx) => idx !== i) }));
  const cToggleCourse = (id) => setCreating((c) => { const s = new Set(c.course_ids || []); s.has(id) ? s.delete(id) : s.add(id); return { ...c, course_ids: [...s] }; });

  async function saveMulti(e) {
    e.preventDefault(); setErr(''); setNote('');
    if (DEMO) return alert('Connect Supabase to edit the catalogue.');
    if (!creating.state_id) return setErr('Please select a state first.');
    const seen = new Set(); const uniq = [];
    for (const raw of creating.names || []) {
      const n = raw.trim(); if (!n) continue;
      const k = n.toLowerCase(); if (!seen.has(k)) { seen.add(k); uniq.push(n); }
    }
    if (!uniq.length) return setErr('Enter at least one college name.');
    const stateId = Number(creating.state_id);
    const existing = new Set(rows.filter((r) => r.state_id === stateId).map((r) => (r.name || '').toLowerCase()));
    const toInsert = uniq.filter((n) => !existing.has(n.toLowerCase()));
    const skipped = uniq.length - toInsert.length;
    if (!toInsert.length) return setErr('All entered colleges already exist in this state.');
    const base = Number(creating.display_order) || 0;
    const payload = toInsert.map((n, i) => ({
      name: n, state_id: stateId, course_ids: (creating.course_ids || []).map(Number),
      display_order: base ? base + i : 0, is_active: creating.is_active ?? true,
    }));
    const { data, error } = await supabase.from('colleges').insert(payload).select('id');
    if (error) return setErr(error.message);
    const sn = states.find((s) => s.id === stateId)?.name || 'the selected state';
    setNote(`✓ Created ${data.length} college${data.length > 1 ? 's' : ''} under ${sn}${skipped ? ` · skipped ${skipped} duplicate` : ''}.`);
    setCreating(null); load();
  }

  // Shared course-picker markup used by both forms.
  const coursePicker = (selected, onToggle, onAll) => (
    <>
      {courses.length > 0 && (
        <div style={{ display: 'flex', gap: 14, marginBottom: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
            <input type="checkbox" checked={selected.length === courses.length}
              ref={(el) => { if (el) el.indeterminate = selected.length > 0 && selected.length < courses.length; }}
              onChange={(e) => onAll(e.target.checked ? courses.map((c) => c.id) : [])} />
            Select all courses
          </label>
          <span className="muted">{selected.length} of {courses.length} selected</span>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '10px 18px', maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
        {courses.length === 0 && <span className="muted">Add courses first.</span>}
        {courses.map((c) => (
          <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="checkbox" style={{ flex: 'none', width: 16, height: 16, margin: 0 }} checked={selected.includes(c.id)} onChange={() => onToggle(c.id)} />
            <span>{c.name}</span>
          </label>
        ))}
      </div>
    </>
  );

  return (
    <div>
      {creating ? (
        <form className="card" onSubmit={saveMulti}>
          <div className="form-grid">
            <Field label="State *">
              <select value={creating.state_id || ''} onChange={(e) => setCreating({ ...creating, state_id: e.target.value })}>
                <option value="">— select state —</option>
                {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Display order (start)"><input type="number" value={creating.display_order ?? 0} onChange={(e) => setCreating({ ...creating, display_order: e.target.value })} /></Field>
          </div>

          {!creating.state_id ? (
            <div className="muted" style={{ marginTop: 12 }}>👆 Select a state to start adding colleges under it.</div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>College names</label>
              {creating.names.map((n, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input value={n} onChange={(e) => cSetName(i, e.target.value)} placeholder={`College #${i + 1} name`} style={{ flex: 1 }} />
                  {creating.names.length > 1 && <button type="button" className="btn danger" onClick={() => cRemoveName(i)}>Remove</button>}
                </div>
              ))}
              <button type="button" className="btn secondary" onClick={cAddName}>+ Add another college</button>

              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Courses offered — applied to all these colleges (optional)</label>
                {coursePicker(creating.course_ids || [], cToggleCourse, (ids) => setCreating({ ...creating, course_ids: ids }))}
              </div>
              <label className="chk" style={{ marginTop: 12 }}><input type="checkbox" checked={creating.is_active ?? true} onChange={(e) => setCreating({ ...creating, is_active: e.target.checked })} /> Active</label>
            </div>
          )}

          {err && <div className="err" style={{ marginTop: 10 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn" disabled={!creating.state_id}>Add Colleges</button>
            <button type="button" className="btn secondary" onClick={() => { setCreating(null); setErr(''); }}>Cancel</button>
          </div>
        </form>
      ) : form ? (
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
              {coursePicker(form.course_ids || [], toggleCourse, (ids) => setForm({ ...form, course_ids: ids }))}
            </Field>
            <Field label="Active"><input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /></Field>
          </div>
          {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn">Save</button>
            <button type="button" className="btn secondary" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn" style={{ marginBottom: 14 }} onClick={() => { setNote(''); setErr(''); setCreating({ state_id: '', names: [''], course_ids: [], is_active: true, display_order: 0 }); }}>+ Add college</button>
      )}

      {note && <div style={{ marginBottom: 12, background: '#e7f6ec', border: '1px solid #bbe7c8', color: '#166534', borderRadius: 10, padding: '10px 14px', fontWeight: 600 }}>{note}</div>}

      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>College</th><th>State</th><th>Courses</th><th style={{ width: 150 }}>Actions</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={4} className="muted">Empty.</td></tr>}
              {rows.map((r) => {
                const names = courseNames(r.course_ids);
                const count = (r.course_ids || []).length;
                const shortNames = names.length > 55 ? names.slice(0, 55).replace(/,\s*[^,]*$/, '') + '…' : names;
                return (
                  <tr key={r.id}>
                    <td>{r.name} {!r.is_active && <span className="badge cold" style={{ marginLeft: 8 }}>inactive</span>}</td>
                    <td>{stateName(r.state_id)}</td>
                    <td className="muted" title={names} style={{ maxWidth: 360 }}>
                      {count > 0 && <span className="badge st-blue" style={{ marginRight: 6 }}>{count}</span>}{shortNames}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn secondary" style={{ marginRight: 6 }} onClick={() => setForm({ ...r, course_ids: r.course_ids || [] })}>Edit</button>
                      <button className="btn danger" onClick={() => remove(r)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
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

// States tab — CRUD + a "No. of colleges" column + search, plus a drill-down
// into a state's colleges → a college's courses (breadcrumbs + Back).
function StatesTab() {
  const [states, setStates] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [selState, setSelState] = useState(null);
  const [selCollege, setSelCollege] = useState(null);

  const load = useCallback(async () => {
    if (DEMO) return;
    const [s, g, c] = await Promise.all([
      supabase.from('states').select('*').order('display_order').order('id'),
      supabase.from('colleges').select('id,name,state_id,course_ids,is_active').order('display_order').order('name'),
      supabase.from('courses').select('id,name'),
    ]);
    setStates(s.data ?? []); setColleges(g.data ?? []); setCourses(c.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setQ(''); }, [selState, selCollege]);

  const collegeCount = (id) => colleges.filter((c) => c.state_id === id).length;
  const courseName = (id) => courses.find((c) => c.id === id)?.name;

  async function save(e) {
    e.preventDefault(); setErr('');
    if (DEMO) return alert('Connect Supabase to edit the catalogue.');
    if (!form.name?.trim()) return setErr('State name is required');
    const payload = { name: form.name.trim(), display_order: Number(form.display_order) || 0, is_active: form.is_active ?? true };
    const qy = form.id ? supabase.from('states').update(payload).eq('id', form.id) : supabase.from('states').insert(payload);
    const { error } = await qy;
    if (error) return setErr(error.message);
    setForm(null); load();
  }
  async function remove(e, r) {
    e.stopPropagation();
    if (DEMO) return; if (!confirm(`Delete "${r.name}"?`)) return;
    await supabase.from('states').delete().eq('id', r.id); load();
  }

  const view = selCollege ? 'courses' : selState ? 'colleges' : 'states';
  const ql = q.trim().toLowerCase();
  const stateRows = states.filter((s) => s.name.toLowerCase().includes(ql));
  const collegeRows = colleges.filter((c) => c.state_id === selState?.id && (c.name || '').toLowerCase().includes(ql));
  const courseRows = (selCollege?.course_ids || []).map(courseName).filter(Boolean)
    .filter((n) => n.toLowerCase().includes(ql)).sort((a, b) => a.localeCompare(b));

  const Crumb = ({ onClick, active, children }) => (
    <span onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', color: active ? 'var(--text)' : 'var(--green)', fontWeight: active ? 800 : 600 }}>{children}</span>
  );

  if (view === 'colleges') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={() => setSelState(null)}>← Back</button>
          <h3 style={{ margin: 0 }}><Crumb onClick={() => setSelState(null)}>States</Crumb> <span className="muted">›</span> <Crumb active>{selState.name}</Crumb></h3>
          <span className="muted">{collegeRows.length} colleges</span>
          <input type="text" placeholder={`Search colleges in ${selState.name}…`} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginLeft: 'auto', minWidth: 220 }} />
        </div>
        <div className="card" style={{ padding: 0 }}><div style={{ overflowX: 'auto' }}><table>
          <thead><tr><th>College</th><th style={{ width: 120 }}>Courses</th><th style={{ width: 50 }}></th></tr></thead>
          <tbody>
            {collegeRows.length === 0 && <tr><td colSpan={3} className="muted">No colleges{ql ? ' match your search' : ' in this state'}.</td></tr>}
            {collegeRows.map((c) => (
              <tr key={c.id} onClick={() => setSelCollege({ id: c.id, name: c.name, course_ids: c.course_ids })} title="View courses">
                <td><b>{c.name}</b>{!c.is_active && <span className="badge cold" style={{ marginLeft: 8 }}>inactive</span>}</td>
                <td><span className="badge st-blue">{(c.course_ids || []).length}</span></td>
                <td className="muted">›</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      </div>
    );
  }

  if (view === 'courses') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={() => setSelCollege(null)}>← Back</button>
          <h3 style={{ margin: 0 }}><Crumb onClick={() => { setSelState(null); setSelCollege(null); }}>States</Crumb> <span className="muted">›</span> <Crumb onClick={() => setSelCollege(null)}>{selState.name}</Crumb> <span className="muted">›</span> <Crumb active>{selCollege.name}</Crumb></h3>
          <span className="muted">{courseRows.length} courses</span>
          <input type="text" placeholder="Search courses…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginLeft: 'auto', minWidth: 220 }} />
        </div>
        <div className="card" style={{ padding: 0 }}><div style={{ overflowX: 'auto' }}><table>
          <thead><tr><th style={{ width: 50 }}>#</th><th>Course</th></tr></thead>
          <tbody>
            {courseRows.length === 0 && <tr><td colSpan={2} className="muted">No courses{ql ? ' match your search' : ' listed for this college'}.</td></tr>}
            {courseRows.map((n, i) => <tr key={n} style={{ cursor: 'default' }}><td className="muted">{i + 1}</td><td>{n}</td></tr>)}
          </tbody>
        </table></div></div>
      </div>
    );
  }

  return (
    <div>
      {form ? (
        <form className="card" onSubmit={save}>
          <div className="form-grid">
            <Field label="State name"><input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
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
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setForm({ is_active: true, display_order: states.length ? Math.max(...states.map((s) => s.display_order || 0)) + 1 : 1 })}>+ Add state</button>
          <input type="text" placeholder="Search states…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginLeft: 'auto', minWidth: 240 }} />
        </div>
      )}
      <div className="card" style={{ padding: 0 }}><div style={{ overflowX: 'auto' }}><table>
        <thead><tr><th style={{ width: 80 }}>Order</th><th>State</th><th style={{ width: 160 }}>No. of colleges</th><th style={{ width: 150 }}>Actions</th></tr></thead>
        <tbody>
          {stateRows.length === 0 && <tr><td colSpan={4} className="muted">No states{ql ? ' match your search' : ''}.</td></tr>}
          {stateRows.map((s) => (
            <tr key={s.id} onClick={() => setSelState({ id: s.id, name: s.name })} title="Click to view colleges">
              <td>{s.display_order}</td>
              <td><b>{s.name}</b>{!s.is_active && <span className="badge cold" style={{ marginLeft: 8 }}>inactive</span>}</td>
              <td><span className="badge st-blue">{collegeCount(s.id)}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn secondary" style={{ marginRight: 6 }} onClick={(e) => { e.stopPropagation(); setForm(s); }}>Edit</button>
                <button className="btn danger" onClick={(e) => remove(e, s)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div></div>
    </div>
  );
}

export default function CatalogPage() {
  const [tab, setTab] = useState('Courses');
  return (
    <div>
      <TopBar />
      <div className="pagehead"><h1>Catalogue</h1><span className="sub">Courses, states, colleges, documents & experts shown in the WhatsApp flow</span></div>
      {DEMO && <div className="banner" style={{ marginBottom: 12 }}>Demo mode — connect Supabase to manage the catalog.</div>}
      <div className="tabs">
        {TABS.map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'Courses' && <SimpleTable table="courses" singular="Course" />}
      {tab === 'States' && <StatesTab />}
      {tab === 'Colleges' && <Colleges />}
      {tab === 'Documents' && <Documents />}
      {tab === 'Counsellors' && <Counsellors />}
      {tab === 'Settings' && <Settings />}
    </div>
  );
}

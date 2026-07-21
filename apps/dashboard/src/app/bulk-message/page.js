'use client';
// Bulk Message — compose a template (text + image/PDF/video + up to 3
// actionable buttons) with a live WhatsApp-style preview, then send it to
// hand-picked leads.
//
// Buttons: Reply (tap sends the label back to the bot), Call (tap opens the
// dialer), Link (tap opens a URL). Sends are staggered ~4-6s apart on the
// backend (WhatsApp bans simultaneous blasts), max 200 per run.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { backendApi } from '../../lib/backendApi';
import { supabase } from '../../lib/supabase';
import { DEMO, demoLeads, STAGE_META, COUNTRY_LABELS } from '../../lib/demo';
import TopBar from '../../components/TopBar';

const TEMPS = ['', 'Hot', 'Warm', 'Cold'];
const COUNTRIES = COUNTRY_LABELS;
const TEMP_CLS = { Hot: 'hot', Warm: 'warm', Cold: 'cold' };
const BTN_META = {
  reply: { icon: '↩️', valuePlaceholder: null },
  call: { icon: '📞', valuePlaceholder: 'Phone e.g. +91 98765 43210' },
  url: { icon: '🔗', valuePlaceholder: 'Link e.g. https://skyai.in/russia' },
};

// Mirrors the backend's buttonLines() — options arrive as smart text
// (WhatsApp strips real buttons from unofficial senders).
const NUM_EMOJI = ['1️⃣', '2️⃣', '3️⃣'];
function optionLines(buttons) {
  let n = 0;
  return buttons.map((b) => {
    if (b.type === 'call') return { icon: '📞', text: `${b.label}: `, link: `+${b.value.replace(/[^\d]/g, '')}` };
    if (b.type === 'url') return { icon: '🔗', text: `${b.label}: `, link: b.value };
    n += 1;
    return { icon: NUM_EMOJI[n - 1], text: `${b.label} — reply `, bold: String(n) };
  });
}
const MAX_MEDIA_MB = 16;
const MAX_RUN = 200;

const emptyBtn = () => ({ type: 'reply', label: '', value: '' });
const mediaKind = (file) =>
  file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'pdf';
const MEDIA_ICONS = { image: '🖼️', video: '🎬', pdf: 'PDF' };

export default function BulkMessage() {
  const [leads, setLeads] = useState(null);
  const [temperature, setTemperature] = useState('');
  const [stage, setStage] = useState('');
  const [country, setCountry] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [buttons, setButtons] = useState([emptyBtn(), emptyBtn(), emptyBtn()]);

  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Leads for the picker (staff-handled ones can't be messaged in bulk).
  const loadLeads = useCallback(async () => {
    if (DEMO) { setLeads(demoLeads.filter((l) => !l.needs_human)); return; }
    const { data } = await supabase.from('leads')
      .select('id, name, whatsapp_number, interested_country, lead_temperature, current_stage, needs_human')
      .eq('needs_human', false)
      .order('lead_score', { ascending: false });
    setLeads(data ?? []);
  }, []);
  useEffect(() => { loadLeads(); }, [loadLeads]);

  // Poll job progress while a run is in flight.
  const poll = useCallback(async () => {
    if (DEMO) return;
    try { setJob(await backendApi('/bulk-message/status')); } catch { /* backend down */ }
  }, []);
  useEffect(() => {
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [poll]);

  const filtered = useMemo(() => (leads ?? []).filter((l) =>
    (!temperature || l.lead_temperature === temperature) &&
    (!stage || l.current_stage === stage) &&
    (!country || l.interested_country === country)
  ), [leads, temperature, stage, country]);

  const filteredIds = useMemo(() => filtered.map((l) => l.id), [filtered]);
  const selectedInFilter = filteredIds.filter((id) => selected.has(id));
  const allChecked = filtered.length > 0 && selectedInFilter.length === filtered.length;

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allChecked) filteredIds.forEach((id) => next.delete(id));
    else filteredIds.forEach((id) => next.add(id));
    return next;
  });

  const setBtn = (i, patch) =>
    setButtons(buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) { setFile(null); return; }
    if (f.size > MAX_MEDIA_MB * 1024 * 1024) {
      alert(`File too large — WhatsApp limit is ${MAX_MEDIA_MB} MB.`);
      e.target.value = '';
      return;
    }
    setFile(f);
  };

  const fileToMedia = (f) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      kind: mediaKind(f),
      base64: String(reader.result).split(',')[1],
      mimetype: f.type || 'application/pdf',
      fileName: f.name,
    });
    reader.onerror = reject;
    reader.readAsDataURL(f);
  });

  const activeButtons = buttons.filter((b) => b.label.trim());
  const invalidBtn = activeButtons.find((b) =>
    (b.type === 'call' && !b.value.replace(/[^\d]/g, '')) ||
    (b.type === 'url' && !/^https?:\/\//i.test(b.value.trim()))
  );

  const send = async () => {
    if (DEMO) { alert('Demo mode — connect the backend first.'); return; }
    const ids = [...selected];
    if (!ids.length || (!text.trim() && !file)) return;
    if (invalidBtn) {
      setError(`Button "${invalidBtn.label}" needs a ${invalidBtn.type === 'call' ? 'phone number' : 'full https:// link'}.`);
      return;
    }
    if (!confirm(
      `Send to ${ids.length} selected lead${ids.length === 1 ? '' : 's'}?\n\n` +
      `${text.trim() ? `"${text.trim()}"\n` : ''}` +
      `${file ? `Attachment: ${file.name}\n` : ''}` +
      `${activeButtons.length ? `Buttons: ${activeButtons.map((b) => b.label).join(' | ')}\n` : ''}\n` +
      `Messages go out one every ~4-6 seconds (WhatsApp safety), ` +
      `so this takes roughly ${Math.max(1, Math.ceil((Math.min(ids.length, MAX_RUN) * 5) / 60))} min.`
    )) return;
    setBusy(true);
    setError('');
    try {
      const media = file ? await fileToMedia(file) : undefined;
      setJob(await backendApi('/bulk-message', {
        method: 'POST',
        body: { text, media, buttons: activeButtons, leadIds: ids },
      }));
      setText(''); setFile(null); setButtons([emptyBtn(), emptyBtn(), emptyBtn()]); setSelected(new Set());
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const pct = job?.total ? Math.round(((job.sent + job.failed) / job.total) * 100) : 0;
  const canSend = selected.size > 0 && (text.trim() || file) && !busy && !job?.running;
  const previewEmpty = !text.trim() && !file && activeButtons.length === 0;

  return (
    <div>
      <TopBar />
      <div className="pagehead">
        <h1>Bulk Message</h1>
        <span className="sub">Template + media + action options → selected leads, staggered ~4s apart</span>
      </div>
      {error && <div className="banner red">{error}</div>}

      {job?.running && (
        <div className="banner">
          📣 Sending… {job.sent + job.failed} of {job.total} ({pct}%)
          {job.failed > 0 && ` — ${job.failed} failed`}
          {job.capped && ` — capped at ${MAX_RUN} leads`}
          <span className="track" style={{ display: 'block', marginTop: 6 }}>
            <i style={{ width: `${pct}%` }} />
          </span>
        </div>
      )}
      {job && !job.running && job.finishedAt && (
        <div className="banner">
          ✅ Last run: {job.sent} sent{job.failed ? `, ${job.failed} failed` : ''} of {job.total}
          {' '}at {new Date(job.finishedAt).toLocaleTimeString()}
        </div>
      )}

      <div className="bulk-grid">
        {/* ── Recipients ── */}
        <div className="card">
          <h3>Recipients — {selected.size} selected{selected.size > MAX_RUN ? ` (first ${MAX_RUN} per run)` : ''}</h3>
          <div className="filters" style={{ margin: '10px 0' }}>
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {Object.entries(COUNTRIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={temperature} onChange={(e) => setTemperature(e.target.value)}>
              {TEMPS.map((t) => <option key={t} value={t}>{t || 'All temperatures'}</option>)}
            </select>
            <select value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">All stages</option>
              {Object.entries(STAGE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 30 }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} title="Select all shown" />
                  </th>
                  <th>Name</th><th>Number</th><th>Country</th><th>Temp</th>
                </tr>
              </thead>
              <tbody>
                {leads === null && <tr><td colSpan={5} className="muted">Loading…</td></tr>}
                {leads !== null && filtered.length === 0 &&
                  <tr><td colSpan={5} className="muted">No leads match these filters.</td></tr>}
                {filtered.map((l) => (
                  <tr key={l.id} onClick={() => toggle(l.id)} className={selected.has(l.id) ? 'sel' : ''}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                    </td>
                    <td title={l.name || ''}>{l.name || '—'}</td>
                    <td>+{l.whatsapp_number}</td>
                    <td>{COUNTRIES[l.interested_country] ?? (l.interested_country ? l.interested_country.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—')}</td>
                    <td><span className={`badge ${TEMP_CLS[l.lead_temperature] ?? 'no'}`}>{l.lead_temperature}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            Tip: pick a country (e.g. Russia) then tick “Select all shown”.
            Staff-handled leads are excluded automatically.
          </p>
        </div>

        <div>
          {/* ── Template ── */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Message template</h3>
            <textarea
              placeholder="Text… e.g. Russia admission window opens Monday — reply here for details."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              style={{ width: '100%', margin: '10px 0' }}
            />

            <h3>Attachment (optional)</h3>
            <input type="file" accept="image/*,video/*,.pdf,application/pdf" onChange={onFile}
                   style={{ margin: '8px 0' }} />
            {file && (
              <p className="muted">
                📎 {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB) —
                sent as {mediaKind(file)} with your text as caption.{' '}
                <a onClick={() => setFile(null)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>remove</a>
              </p>
            )}

            <h3 style={{ marginTop: 12 }}>Action options (optional, max 3)</h3>
            <p className="muted" style={{ margin: '4px 0 8px' }}>
              Delivered as smart text (WhatsApp blocks real buttons for unofficial senders):
              <b> Call</b> numbers are tap-to-dial, <b>Link</b>s are tap-to-open, and
              <b> Reply</b> options are answered by typing the number.
            </p>
            {buttons.map((b, i) => (
              <div key={i} className="btn-row">
                <select value={b.type} onChange={(e) => setBtn(i, { type: e.target.value, value: '' })}>
                  <option value="reply">↩️ Reply</option>
                  <option value="call">📞 Call</option>
                  <option value="url">🔗 Link</option>
                </select>
                <input type="text" placeholder={`Button ${i + 1} label`}
                       value={b.label} onChange={(e) => setBtn(i, { label: e.target.value })} />
                {BTN_META[b.type].valuePlaceholder
                  ? <input type="text" placeholder={BTN_META[b.type].valuePlaceholder}
                           value={b.value} onChange={(e) => setBtn(i, { value: e.target.value })} />
                  : <span className="muted" style={{ alignSelf: 'center', fontSize: 12 }}>tap = sends label to bot</span>}
              </div>
            ))}

            <button className="btn" onClick={send} disabled={!canSend} style={{ marginTop: 12 }}>
              {job?.running ? 'Bulk message in progress…'
                : busy ? 'Starting…'
                : `Send to ${Math.min(selected.size, MAX_RUN)} selected lead${selected.size === 1 ? '' : 's'}`}
            </button>
            <p className="muted" style={{ marginTop: 12 }}>
              ⚠️ WhatsApp can ban numbers that spam — messages are staggered one every ~4-6s.
              If WhatsApp refuses tap-buttons (common for unofficial senders), students get a
              text version where numbers and links are still tappable.
            </p>
          </div>

          {/* ── Live preview ── */}
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Preview — what the student sees</h3>
            <div className="wa-preview">
              {previewEmpty && <div className="wa-empty">Start typing to see the preview…</div>}
              {!previewEmpty && (
                <>
                  <div className="wa-bubble">
                    {file && (
                      <div className="wa-media">
                        <span className="ic">{MEDIA_ICONS[mediaKind(file)]}</span>
                        <span>{file.name}</span>
                      </div>
                    )}
                    {text.trim() && <span>{text.trim()}</span>}
                    {/* Options ride in the same message when there's no media */}
                    {!file && activeButtons.length > 0 && (
                      <span style={{ display: 'block', marginTop: text.trim() ? 8 : 0 }}>
                        {optionLines(activeButtons).map((l, i) => (
                          <span key={i} style={{ display: 'block' }}>
                            {l.icon} {l.text}
                            {l.link && <span style={{ color: '#0a7cff', textDecoration: 'underline' }}>{l.link}</span>}
                            {l.bold && <b>{l.bold}</b>}
                          </span>
                        ))}
                      </span>
                    )}
                    <span className="wa-time">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓
                    </span>
                  </div>
                  {/* With media, options arrive as a second message */}
                  {file && activeButtons.length > 0 && (
                    <div className="wa-bubble" style={{ marginTop: 6 }}>
                      {optionLines(activeButtons).map((l, i) => (
                        <span key={i} style={{ display: 'block' }}>
                          {l.icon} {l.text}
                          {l.link && <span style={{ color: '#0a7cff', textDecoration: 'underline' }}>{l.link}</span>}
                          {l.bold && <b>{l.bold}</b>}
                        </span>
                      ))}
                      <span className="wa-time">
                        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

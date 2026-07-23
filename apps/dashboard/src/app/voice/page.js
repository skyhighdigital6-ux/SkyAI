'use client';
// AI Voice Calling — campaigns list + create. Contacts are uploaded per
// campaign (Excel/CSV) on the campaign detail page.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { DEMO } from '../../lib/demo';
import TopBar from '../../components/TopBar';

const STATUS_CLS = {
  draft: 'st-gray', scheduled: 'st-blue', running: 'st-green',
  paused: 'st-amber', completed: 'st-teal', failed: 'st-red',
};

export default function VoicePage() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (DEMO) { setRows([]); return; }
    const [c, a] = await Promise.all([
      supabase.from('voice_campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('voice_agents').select('id,name').eq('is_active', true).order('id'),
    ]);
    setRows(c.data ?? []);
    setAgents(a.data ?? []);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  async function save(e) {
    e.preventDefault(); setErr('');
    if (DEMO) return alert('Connect Supabase to create campaigns.');
    if (!form.name?.trim()) return setErr('Campaign name is required');
    const payload = {
      name: form.name.trim(),
      direction: form.direction || 'outbound',
      agent_id: form.agent_id || null,
      from_number: form.from_number?.trim() || null,
      concurrency: Number(form.concurrency) || 3,
      max_attempts: Number(form.max_attempts) || 1,
      call_window_start: form.call_window_start || '09:00',
      call_window_end: form.call_window_end || '20:00',
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      status: form.scheduled_at ? 'scheduled' : 'draft',
    };
    const { data, error } = await supabase.from('voice_campaigns').insert(payload).select('id').single();
    if (error) return setErr(error.message);
    setForm(null); load();
    router.push(`/voice/${data.id}`);
  }

  return (
    <div>
      <TopBar />
      <div className="pagehead" style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div><h1 style={{ margin: 0 }}>AI Voice Calling</h1><span className="sub">{(rows ?? []).length} campaigns</span></div>
        {!form && <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => setForm({ direction: 'outbound', concurrency: 3, max_attempts: 1 })}>+ New campaign</button>}
      </div>

      {form && (
        <form className="card" onSubmit={save}>
          <div className="form-grid">
            <div className="full"><label>Campaign name</label><input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. MBBS enquiries — July batch" /></div>
            <div><label>Direction</label>
              <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                <option value="outbound">Outbound (bulk calling)</option>
                <option value="inbound">Inbound (AI answers)</option>
              </select>
            </div>
            <div><label>AI agent</label>
              <select value={form.agent_id || ''} onChange={(e) => setForm({ ...form, agent_id: e.target.value })}>
                <option value="">— default —</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div><label>Caller ID / from number</label><input value={form.from_number || ''} onChange={(e) => setForm({ ...form, from_number: e.target.value })} /></div>
            <div><label>Concurrent calls</label><input type="number" min="1" max="100" value={form.concurrency} onChange={(e) => setForm({ ...form, concurrency: e.target.value })} /></div>
            <div><label>Max attempts / contact</label><input type="number" min="1" max="5" value={form.max_attempts} onChange={(e) => setForm({ ...form, max_attempts: e.target.value })} /></div>
            <div><label>Schedule start (optional)</label><input type="datetime-local" value={form.scheduled_at || ''} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
            <div><label>Call window start</label><input type="time" value={form.call_window_start || '09:00'} onChange={(e) => setForm({ ...form, call_window_start: e.target.value })} /></div>
            <div><label>Call window end</label><input type="time" value={form.call_window_end || '20:00'} onChange={(e) => setForm({ ...form, call_window_end: e.target.value })} /></div>
          </div>
          {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn">Create campaign</button>
            <button type="button" className="btn secondary" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Campaign</th><th>Direction</th><th>Status</th><th>Concurrency</th><th>Window</th><th>Created</th></tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={6} className="muted">Loading…</td></tr>}
              {rows !== null && rows.length === 0 && <tr><td colSpan={6} className="muted">No campaigns yet. Create one, then upload contacts to start calling.</td></tr>}
              {(rows ?? []).map((c) => (
                <tr key={c.id} onClick={() => router.push(`/voice/${c.id}`)}>
                  <td><b>{c.name}</b></td>
                  <td>{c.direction}</td>
                  <td><span className={`badge ${STATUS_CLS[c.status] ?? 'st-gray'}`}>{c.status}</span></td>
                  <td>{c.concurrency}</td>
                  <td className="muted">{String(c.call_window_start).slice(0, 5)}–{String(c.call_window_end).slice(0, 5)}</td>
                  <td className="muted">{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

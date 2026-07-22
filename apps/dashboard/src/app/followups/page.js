'use client';
// Scheduled Follow-ups — leads stuck mid-flow who are getting the automated
// no-reply reminders (8h friendly + 24h final). The backend sends these; a
// reply cancels pending reminders and continues the flow.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { DEMO } from '../../lib/demo';
import { fetchCatalogMaps, leadCourse, leadState } from '../../lib/catalogNames';
import TopBar from '../../components/TopBar';

const INCOMPLETE = ['awaiting_course', 'awaiting_other_course', 'awaiting_state', 'awaiting_other_state',
  'awaiting_college', 'awaiting_other_college', 'awaiting_action'];
const H8 = 8 * 3600000, H24 = 24 * 3600000;

const rel = (ms) => {
  const abs = Math.abs(ms), h = Math.floor(abs / 3600000), m = Math.floor((abs % 3600000) / 60000);
  const s = h ? `${h}h ${m}m` : `${m}m`;
  return ms >= 0 ? `in ${s}` : `${s} ago`;
};

// Next reminder due for a lead, based on time since the last bot message.
function nextReminder(l) {
  if (!l.last_bot_message_at) return { label: '—', due: null };
  const last = new Date(l.last_bot_message_at).getTime();
  if (!l.reminder_8h_sent) return { label: 'First (8h)', due: last + H8 };
  if (!l.reminder_24h_sent) return { label: 'Final (24h)', due: last + H24 };
  return { label: 'Reminders done', due: null };
}

export default function FollowUps() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [maps, setMaps] = useState({ courses: {}, states: {}, colleges: {}, counsellors: {} });
  const [tab, setTab] = useState('pending'); // pending | done

  const load = useCallback(async () => {
    if (DEMO) { setRows([]); return; }
    const { data } = await supabase.from('leads').select('*')
      .in('flow_step', INCOMPLETE)
      .eq('needs_human', false).eq('opted_out', false).eq('automation_paused', false)
      .not('last_bot_message_at', 'is', null)
      .order('last_bot_message_at', { ascending: true });
    setRows(data ?? []);
  }, []);

  useEffect(() => { if (!DEMO) fetchCatalogMaps().then(setMaps); }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const all = rows ?? [];
  const done = all.filter((l) => l.reminder_8h_sent && l.reminder_24h_sent);
  const pending = all.filter((l) => !(l.reminder_8h_sent && l.reminder_24h_sent));
  const shown = tab === 'pending' ? pending : done;

  return (
    <div>
      <TopBar />
      <div className="pagehead">
        <h1>Scheduled Follow-ups</h1>
        <span className="sub">leads stuck mid-flow — the bot sends an 8h and a 24h reminder automatically</span>
      </div>

      <div className="tabs">
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>Awaiting reply ({pending.length})</button>
        <button className={tab === 'done' ? 'active' : ''} onClick={() => setTab('done')}>Reminders sent ({done.length})</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr>
              <th>Name</th><th>Number</th><th>Course</th><th>State</th><th>Stage</th>
              <th>Last message</th><th>Next reminder</th><th>Reminders</th>
            </tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={8} className="muted">Loading…</td></tr>}
              {rows !== null && shown.length === 0 && (
                <tr><td colSpan={8} className="muted">
                  {tab === 'pending' ? 'No leads awaiting reply right now.' : 'No leads have exhausted both reminders yet.'}
                </td></tr>
              )}
              {shown.map((l) => {
                const nr = nextReminder(l);
                return (
                  <tr key={l.id} onClick={() => router.push(`/leads/${l.id}`)}>
                    <td>{l.name || '—'}</td>
                    <td>+{l.whatsapp_number}</td>
                    <td>{leadCourse(l, maps)}</td>
                    <td>{leadState(l, maps)}</td>
                    <td>{l.flow_status || '—'}</td>
                    <td>{rel(new Date(l.last_bot_message_at) - Date.now())}</td>
                    <td>{nr.due ? `${nr.label} · ${rel(nr.due - Date.now())}` : nr.label}</td>
                    <td>
                      <span className={`badge ${l.reminder_8h_sent ? 'no' : 'cold'}`} style={{ marginRight: 4 }}>8h {l.reminder_8h_sent ? '✓' : '–'}</span>
                      <span className={`badge ${l.reminder_24h_sent ? 'no' : 'cold'}`}>24h {l.reminder_24h_sent ? '✓' : '–'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        Reminders fire automatically: a friendly nudge after 8 hours and a final one after 24 hours of no reply.
        If the student replies, pending reminders are cancelled and the flow continues.
      </p>
    </div>
  );
}

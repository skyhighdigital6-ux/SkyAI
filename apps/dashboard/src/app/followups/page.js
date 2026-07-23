'use client';
// Scheduled Follow-ups.
//  • "Scheduled callbacks" — leads who asked to be contacted at a specific time
//    ("contact me after 4 days", "call back on 4 Sep"). Shows the exact date the
//    bot will re-engage them (follow_up_date).
//  • "Reminder queue" — leads stuck mid-flow getting the automatic 8h/24h
//    no-reply nudges.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { DEMO } from '../../lib/demo';
import { fetchCatalogMaps, leadCourse, leadState } from '../../lib/catalogNames';
import TopBar from '../../components/TopBar';

const INCOMPLETE = ['awaiting_course', 'awaiting_other_course', 'awaiting_state', 'awaiting_other_state',
  'awaiting_college', 'awaiting_other_college', 'awaiting_action'];
const H8 = 8 * 3600000, H24 = 24 * 3600000;

const fmtDate = (iso) => new Date(iso).toLocaleString('en-IN', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
});
const rel = (ms) => {
  const abs = Math.abs(ms), d = Math.floor(abs / 86400000), h = Math.floor((abs % 86400000) / 3600000), m = Math.floor((abs % 3600000) / 60000);
  const s = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  return ms >= 0 ? `in ${s}` : `${s} overdue`;
};

function nextReminder(l) {
  if (!l.last_bot_message_at) return { label: '—', due: null };
  const last = new Date(l.last_bot_message_at).getTime();
  if (!l.reminder_8h_sent) return { label: 'First (8h)', due: last + H8 };
  if (!l.reminder_24h_sent) return { label: 'Final (24h)', due: last + H24 };
  return { label: 'Reminders done', due: null };
}

export default function FollowUps() {
  const router = useRouter();
  const [callbacks, setCallbacks] = useState(null);
  const [reminders, setReminders] = useState(null);
  const [maps, setMaps] = useState({ courses: {}, states: {}, colleges: {}, counsellors: {} });
  const [tab, setTab] = useState('callbacks');

  const load = useCallback(async () => {
    if (DEMO) { setCallbacks([]); setReminders([]); return; }
    const [cb, rq] = await Promise.all([
      supabase.from('leads').select('*').not('follow_up_date', 'is', null).order('follow_up_date', { ascending: true }),
      supabase.from('leads').select('*')
        .in('flow_step', INCOMPLETE).eq('needs_human', false).eq('opted_out', false).eq('automation_paused', false)
        .is('follow_up_date', null).not('last_bot_message_at', 'is', null)
        .order('last_bot_message_at', { ascending: true }),
    ]);
    setCallbacks(cb.data ?? []);
    setReminders(rq.data ?? []);
  }, []);

  useEffect(() => { if (!DEMO) fetchCatalogMaps().then(setMaps); }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const cbUpcoming = (callbacks ?? []).filter((l) => !l.follow_up_sent);
  const cbSent = (callbacks ?? []).filter((l) => l.follow_up_sent);

  return (
    <div>
      <TopBar />
      <div className="pagehead">
        <h1>Scheduled Follow-ups</h1>
        <span className="sub">callbacks students asked for, and the automatic no-reply reminders</span>
      </div>

      <div className="tabs">
        <button className={tab === 'callbacks' ? 'active' : ''} onClick={() => setTab('callbacks')}>Scheduled callbacks ({cbUpcoming.length})</button>
        <button className={tab === 'reminders' ? 'active' : ''} onClick={() => setTab('reminders')}>Reminder queue ({(reminders ?? []).length})</button>
      </div>

      {tab === 'callbacks' ? (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr>
                <th>Name</th><th>Number</th><th>Course</th><th>Stage</th>
                <th>Contact on</th><th>When</th><th>Status</th>
              </tr></thead>
              <tbody>
                {callbacks === null && <tr><td colSpan={7} className="muted">Loading…</td></tr>}
                {callbacks !== null && callbacks.length === 0 && (
                  <tr><td colSpan={7} className="muted">No scheduled callbacks yet. When a student says e.g. “contact me after 4 days” or “call back on 4 Sep”, it appears here with the exact date.</td></tr>
                )}
                {[...cbUpcoming, ...cbSent].map((l) => (
                  <tr key={l.id} onClick={() => router.push(`/leads/${l.id}`)}>
                    <td>{l.name || '—'}</td>
                    <td>+{l.whatsapp_number}</td>
                    <td>{leadCourse(l, maps)}</td>
                    <td>{l.flow_status || '—'}</td>
                    <td><b>{fmtDate(l.follow_up_date)}</b></td>
                    <td>{rel(new Date(l.follow_up_date) - Date.now())}</td>
                    <td>{l.follow_up_sent
                      ? <span className="badge no">Sent ✓</span>
                      : <span className="badge st-amber">Upcoming</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr>
                <th>Name</th><th>Number</th><th>Course</th><th>State</th><th>Stage</th>
                <th>Last message</th><th>Next reminder</th><th>Reminders</th>
              </tr></thead>
              <tbody>
                {reminders === null && <tr><td colSpan={8} className="muted">Loading…</td></tr>}
                {reminders !== null && reminders.length === 0 && <tr><td colSpan={8} className="muted">No leads awaiting reply right now.</td></tr>}
                {(reminders ?? []).map((l) => {
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
      )}
      <p className="muted" style={{ marginTop: 10 }}>
        Scheduled callbacks fire at the exact time the student requested; no-reply reminders nudge stuck leads after 8h and 24h.
        A reply cancels pending follow-ups and continues the flow.
      </p>
    </div>
  );
}

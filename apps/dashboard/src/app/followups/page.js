'use client';
// Scheduled Follow-ups — leads who asked to be contacted later. The backend
// sends each a tone-matched re-engagement message when the date arrives;
// replying before the date cancels the follow-up automatically.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { DEMO, STAGE_META, COUNTRY_LABELS } from '../../lib/demo';
import TopBar from '../../components/TopBar';

const TEMP_CLS = { Hot: 'hot', Warm: 'warm', Cold: 'cold' };
const label = (id) =>
  COUNTRY_LABELS[id] ?? (id ? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—');

const fmtWhen = (iso) => {
  const d = new Date(iso);
  const days = Math.ceil((d - Date.now()) / 86400000);
  const when = d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (days < 0) return `${when} · overdue`;
  if (days === 0) return `${when} · today`;
  return `${when} · in ${days} day${days === 1 ? '' : 's'}`;
};

export default function FollowUps() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState('upcoming'); // upcoming | sent

  const load = useCallback(async () => {
    if (DEMO) { setRows([]); return; }
    const { data } = await supabase.from('leads')
      .select('id, name, whatsapp_number, interested_country, interested_course, lead_temperature, current_stage, follow_up_date, follow_up_sent, last_active_at')
      .not('follow_up_date', 'is', null)
      .order('follow_up_date', { ascending: true });
    setRows(data ?? []);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const upcoming = (rows ?? []).filter((r) => !r.follow_up_sent);
  const sent = (rows ?? []).filter((r) => r.follow_up_sent);
  const shown = tab === 'upcoming' ? upcoming : sent;

  return (
    <div>
      <TopBar />
      <div className="pagehead">
        <h1>Scheduled Follow-ups</h1>
        <span className="sub">students who asked to be contacted later</span>
      </div>

      <div className="tabs">
        <button className={tab === 'upcoming' ? 'active' : ''} onClick={() => setTab('upcoming')}>
          Upcoming ({upcoming.length})
        </button>
        <button className={tab === 'sent' ? 'active' : ''} onClick={() => setTab('sent')}>
          Sent ({sent.length})
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Number</th><th>Interest</th><th>Temp</th><th>Stage</th>
              <th>{tab === 'upcoming' ? 'Follow-up due' : 'Was due'}</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan={6} className="muted">Loading…</td></tr>}
            {rows !== null && shown.length === 0 && (
              <tr><td colSpan={6} className="muted">
                {tab === 'upcoming'
                  ? 'No pending follow-ups. When a student says "talk later", the bot schedules one automatically.'
                  : 'No follow-ups have been sent yet.'}
              </td></tr>
            )}
            {shown.map((l) => {
              const st = STAGE_META[l.current_stage] ?? { label: l.current_stage, cls: 'st-gray' };
              return (
                <tr key={l.id} onClick={() => router.push(`/leads/${l.id}`)}>
                  <td>{l.name || '—'}</td>
                  <td>+{l.whatsapp_number}</td>
                  <td>{label(l.interested_country)}{l.interested_course ? ` – ${l.interested_course.toUpperCase()}` : ''}</td>
                  <td><span className={`badge ${TEMP_CLS[l.lead_temperature] ?? 'no'}`}>{l.lead_temperature}</span></td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                  <td>{fmtWhen(l.follow_up_date)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        Follow-ups are sent automatically by the bot in the student's own tone.
        If the student messages first, their pending follow-up is cancelled.
      </p>
    </div>
  );
}

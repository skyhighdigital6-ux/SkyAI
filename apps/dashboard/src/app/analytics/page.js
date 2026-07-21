'use client';
// Full analytics — stat cards, funnel, temperature & quota donuts, stage table.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { backendApi } from '../../lib/backendApi';
import { DEMO, demoLeads, demoQuota, STAGE_META } from '../../lib/demo';
import TopBar from '../../components/TopBar';
import { Ic } from '../../components/Icons';

export default function Analytics() {
  const [leads, setLeads] = useState([]);
  const [quota, setQuota] = useState(DEMO ? demoQuota : null);

  useEffect(() => {
    if (DEMO) { setLeads(demoLeads); return; }
    supabase.from('leads').select('current_stage, lead_temperature, needs_human, lead_score').then(({ data }) => setLeads(data ?? []));
    backendApi('/quota').then(setQuota).catch(() => {});
  }, []);

  const count = (fn) => leads.filter(fn).length;
  const hot = count((l) => l.lead_temperature === 'Hot');
  const warm = count((l) => l.lead_temperature === 'Warm');
  const won = count((l) => l.current_stage === 'closed_won');
  const hotDeg = leads.length ? (hot / leads.length) * 360 : 0;
  const warmDeg = leads.length ? (warm / leads.length) * 360 : 0;
  const pct = quota?.gemini_pct ?? 0;

  const FUNNEL = [
    ['New Inquiry', leads.length],
    ['Eligibility Check', count((l) => !['new', 'discovery'].includes(l.current_stage))],
    ['Brochure Sent', count((l) => ['brochure_sent', 'faq', 'documents', 'admission', 'closed_won'].includes(l.current_stage))],
    ['Documents Pending', count((l) => ['documents', 'admission'].includes(l.current_stage))],
    ['Converted', won],
  ];
  const fmax = Math.max(1, ...FUNNEL.map(([, n]) => n));

  return (
    <div>
      <TopBar />
      <div className="pagehead"><h1>Analytics</h1><span className="sub">Conversion & AI usage</span></div>

      {pct >= 80 && (
        <div className={`banner ${pct >= 95 ? 'red' : ''}`}>
          ⚠️ Gemini quota at {pct}% ({quota.gemini_requests}/{quota.gemini_daily_limit} today).
          {pct >= 100 ? ' Bot is running on Groq fallback.' : ' Groq fallback will take over when exhausted.'}
        </div>
      )}

      <div className="stats">
        <div className="stat"><div className="ico green"><Ic name="users" /></div><div><div className="lbl">Total Leads</div><div className="num">{leads.length}</div></div></div>
        <div className="stat"><div className="ico red"><Ic name="flame" /></div><div><div className="lbl">Hot</div><div className="num">{hot}</div></div></div>
        <div className="stat"><div className="ico mint"><Ic name="trend" /></div><div><div className="lbl">Warm</div><div className="num">{warm}</div></div></div>
        <div className="stat"><div className="ico gray"><Ic name="user" /></div><div><div className="lbl">Needs Human</div><div className="num">{count((l) => l.needs_human)}</div></div></div>
        <div className="stat"><div className="ico blue"><Ic name="award" /></div><div><div className="lbl">Converted</div><div className="num">{won}</div></div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Conversion Funnel — drop-off per stage</h3>
          {FUNNEL.map(([lbl, n]) => (
            <div key={lbl} className="funnel-row" style={{ gridTemplateColumns: '150px 1fr 90px' }}>
              <span>{lbl}</span>
              <span className="bar" style={{ height: 14 }}><i style={{ width: `${(n / fmax) * 100}%` }} /></span>
              <span className="n">{n} ({leads.length ? Math.round((n / leads.length) * 100) : 0}%)</span>
            </div>
          ))}
          <h3 style={{ marginTop: 18 }}>Leads per stage</h3>
          <table>
            <thead><tr><th>Stage</th><th>Leads</th><th>Share</th></tr></thead>
            <tbody>
              {Object.entries(STAGE_META).map(([k, v]) => {
                const n = count((l) => l.current_stage === k);
                if (!n) return null;
                return (
                  <tr key={k} style={{ cursor: 'default' }}>
                    <td><span className={`badge ${v.cls}`}>{v.label}</span></td>
                    <td><b>{n}</b></td>
                    <td>{Math.round((n / leads.length) * 100)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 13 }}>
            <h3>Leads by Temperature</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div className="donut" style={{ width: 140, height: 140, background: `conic-gradient(#dc2626 0 ${hotDeg}deg, #f59e0b ${hotDeg}deg ${hotDeg + warmDeg}deg, #cbd5e1 ${hotDeg + warmDeg}deg 360deg)` }}>
                <span className="center">{leads.length}<small>Total</small></span>
              </div>
              <div>
                <div className="kv"><span><span className="badge hot"><span className="b-dot" />Hot</span></span><b>{hot}</b></div>
                <div className="kv"><span><span className="badge warm"><span className="b-dot" />Warm</span></span><b>{warm}</b></div>
                <div className="kv"><span><span className="badge cold"><span className="b-dot" />Cold</span></span><b>{leads.length - hot - warm}</b></div>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>AI Usage Today</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div className="donut" style={{ width: 140, height: 140, background: `conic-gradient(#3f8f2f 0 ${pct * 3.6}deg, #b5dc4e ${pct * 3.6}deg 360deg)` }}>
                <span className="center">{pct}%<small>Used</small></span>
              </div>
              <div style={{ flex: 1 }}>
                <div className="kv"><span>Gemini requests</span><b>{quota?.gemini_requests ?? 0} / {quota?.gemini_daily_limit ?? '—'}</b></div>
                <div className="kv"><span>Groq (fallback)</span><b>{quota?.groq_requests ?? 0}</b></div>
                <div className="kv"><span>Alert threshold</span><b>80%</b></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

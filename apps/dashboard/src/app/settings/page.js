'use client';
// Connection status + setup checklist — live view of what is wired up.
import { useEffect, useState } from 'react';
import { DEMO } from '../../lib/demo';
import TopBar from '../../components/TopBar';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3001';

export default function Settings() {
  const [backendUp, setBackendUp] = useState(null);

  useEffect(() => {
    fetch(`${BACKEND}/health`).then((r) => setBackendUp(r.ok)).catch(() => setBackendUp(false));
  }, []);

  const Row = ({ ok, title, sub }) => (
    <div className="setting-row">
      <span className={`status-dot ${ok ? 'ok' : 'bad'}`} style={{ marginTop: 6 }} />
      <span className="t">{title}<small>{sub}</small></span>
      <span className={`badge ${ok ? 'no' : 'warm'}`} style={{ marginLeft: 'auto' }}>{ok ? 'Connected' : 'Pending'}</span>
    </div>
  );

  return (
    <div>
      <TopBar />
      <div className="pagehead"><h1>Settings</h1><span className="sub">Connections & setup</span></div>

      <div className="card">
        <h3>🔌 Service Connections</h3>
        <Row ok={backendUp === true} title="Backend (Express + Baileys)" sub={backendUp ? `Running at ${BACKEND}` : `Not reachable at ${BACKEND} — npm run backend`} />
        <Row ok={!DEMO} title="Supabase (Database + Auth + Storage)" sub={DEMO ? 'Demo mode active — add the SUPABASE keys in .env to connect live data' : 'Connected — live data'} />
        <Row ok={false} title="Gemini API" sub="Set GEMINI_API_KEY in .env — free key from aistudio.google.com/apikey" />
        <Row ok={false} title="Groq API (fallback)" sub="Set GROQ_API_KEY in .env — free key from console.groq.com/keys" />
        <Row ok={true} title="WhatsApp (Baileys)" sub={DEMO ? 'Demo — connect a real number from the Connect WhatsApp page' : 'Session active'} />
      </div>

      <div className="card">
        <h3>🚀 Go-live checklist</h3>
        <div className="setting-row"><span className="avatar sq">1</span><span className="t">Create the Supabase project and run the migration SQL<small>supabase/migrations/0001_initial_schema.sql → SQL Editor</small></span></div>
        <div className="setting-row"><span className="avatar sq">2</span><span className="t">Fill in all keys in .env<small>SUPABASE_URL, SERVICE_ROLE_KEY, ANON_KEY, GEMINI_API_KEY, GROQ_API_KEY</small></span></div>
        <div className="setting-row"><span className="avatar sq">3</span><span className="t">Start the backend and pair WhatsApp<small>Connect WhatsApp page → scan the QR from Linked Devices</small></span></div>
        <div className="setting-row"><span className="avatar sq">4</span><span className="t">Populate the Catalog with real data<small>Courses, states, colleges & documents — via the Catalog editor</small></span></div>
        <div className="setting-row" style={{ borderBottom: 'none' }}><span className="avatar sq">5</span><span className="t">Add counselor persona examples<small>20–50 real chat transcripts in apps/backend/src/ai/persona.js</small></span></div>
      </div>

      <div className="card">
        <h3>🔒 Data Privacy</h3>
        <div className="muted" style={{ lineHeight: 1.6 }}>
          Every new student receives a privacy disclosure message at the start of their first
          conversation. To permanently delete all data for a lead, open the lead&apos;s page and use
          <b> Purge data</b> — the profile and all messages are removed irreversibly.
        </div>
      </div>
    </div>
  );
}

'use client';
// All PDFs shared with students, across every lead.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { DEMO, demoLeads } from '../../lib/demo';
import TopBar from '../../components/TopBar';

const initials = (n) => (n || '??').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export default function Documents() {
  const router = useRouter();
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    if (DEMO) { setLeads(demoLeads); return; }
    supabase.from('leads').select('id, name, whatsapp_number, documents_shared').then(({ data }) => setLeads(data ?? []));
  }, []);

  const rows = leads.flatMap((l) => (l.documents_shared ?? []).map((d) => ({ ...d, lead: l })));

  return (
    <div>
      <TopBar />
      <div className="pagehead"><h1>Documents</h1><span className="sub">{rows.length} PDFs shared with students</span></div>
      <div className="card">
        {rows.length === 0 && <div className="muted">No brochures have been shared yet.</div>}
        {rows.map((r, i) => (
          <div key={i} className="rowitem" onClick={() => router.push(`/leads/${r.lead.id}`)}>
            <span className="pdf-ico">PDF</span>
            <span className="nm">{r.doc}<small>{r.size ?? 'PDF document'}</small></span>
            <span className="avatar sq" style={{ marginLeft: 'auto' }}>{initials(r.lead.name)}</span>
            <span className="nm" style={{ minWidth: 130 }}>{r.lead.name}<small>+{r.lead.whatsapp_number}</small></span>
            <span className="end">{new Date(r.sent_at).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
      </div>
      <div className="card muted">
        📦 Brochures are stored in the Supabase Storage <b>brochures</b> bucket. Set the brochure path
        on each destination&apos;s Knowledge Base entry and the bot automatically sends the right PDF —
        every share is logged here.
      </div>
    </div>
  );
}

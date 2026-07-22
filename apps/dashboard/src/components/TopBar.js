'use client';
// Shared top bar: search (jumps to sidebar pages) on the left; Gemini usage,
// Groq fallback and user chip on the right.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEMO, demoQuota } from '../lib/demo';
import { backendApi } from '../lib/backendApi';
import { supabase } from '../lib/supabase';
import { Ic } from './Icons';

// The sidebar destinations the search can jump to.
const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/leads', label: 'Leads' },
  { href: '/conversations', label: 'Conversations' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/documents', label: 'Documents' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/staff', label: 'Staff' },
  { href: '/followups', label: 'Scheduled Follow-ups' },
  { href: '/bulk-message', label: 'Bulk Message' },
  { href: '/whatsapp', label: 'Connect WhatsApp' },
  { href: '/settings', label: 'Settings' },
];

export default function TopBar() {
  const router = useRouter();
  const [quota, setQuota] = useState(DEMO ? demoQuota : null);
  const [who, setWho] = useState(DEMO ? 'Demo Counselor' : '');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (DEMO) return;
    backendApi('/quota').then(setQuota).catch(() => {});
    supabase.auth.getUser().then(({ data }) => setWho(data.user?.email ?? ''));
  }, []);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const matches = q.trim()
    ? NAV.filter((n) => n.label.toLowerCase().includes(q.trim().toLowerCase()))
    : NAV;

  const go = (href) => { setQ(''); setOpen(false); router.push(href); };

  return (
    <div className="topbar">
      <div ref={boxRef} style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 430 }}>
        <label className="search" style={{ maxWidth: 'none' }}>
          <Ic name="search" size={15} />
          <input
            placeholder="Search pages… (Leads, Catalog, Settings…)"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) go(matches[0].href); if (e.key === 'Escape') setOpen(false); }}
          />
        </label>
        {open && matches.length > 0 && (
          <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, padding: 6, zIndex: 40, maxHeight: 320, overflow: 'auto', boxShadow: '0 8px 24px rgba(16,24,40,.12)' }}>
            {matches.map((n) => (
              <div key={n.href} onClick={() => go(n.href)}
                style={{ padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13.5 }}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--green-soft)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                {n.label}
              </div>
            ))}
          </div>
        )}
      </div>
      <span className="tright">
        {quota && (
          <span className="pill green"><Ic name="zap" size={14} /> <span>Gemini Usage {quota.gemini_pct}%
            <span className="track"><i style={{ width: `${Math.min(100, quota.gemini_pct)}%` }} /></span></span>
          </span>
        )}
        <span className="pill amber"><Ic name="alert" size={14} /> Fallback ready: <b>Groq enabled</b></span>
        <span className="userchip">
          <span className="avatar">{(who || 'D')[0].toUpperCase()}</span>
          <span className="who">{who || 'Counselor'}<small>Counselor</small></span>
        </span>
      </span>
    </div>
  );
}

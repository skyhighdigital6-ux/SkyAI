'use client';
// Shared top bar: wide search left; date, Gemini usage, Groq fallback and
// user chip grouped to the right — like the reference design.
import { useEffect, useState } from 'react';
import { DEMO, demoQuota } from '../lib/demo';
import { backendApi } from '../lib/backendApi';
import { supabase } from '../lib/supabase';
import { Ic } from './Icons';

export default function TopBar() {
  const [quota, setQuota] = useState(DEMO ? demoQuota : null);
  const [who, setWho] = useState(DEMO ? 'Demo Counselor' : '');

  useEffect(() => {
    if (DEMO) return;
    backendApi('/quota').then(setQuota).catch(() => {});
    supabase.auth.getUser().then(({ data }) => setWho(data.user?.email ?? ''));
  }, []);

  return (
    <div className="topbar">
      <label className="search"><Ic name="search" size={15} /><input placeholder="Search leads, conversations, docs…" /></label>
      <span className="tright">
        <span className="pill"><Ic name="calendar" size={14} /> 11 Jul – 17 Jul 2026 ▾</span>
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

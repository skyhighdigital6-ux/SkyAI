'use client';
// App frame — left sidebar + auth gate. In DEMO mode there is no login;
// the dashboard opens directly with dummy data.
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { DEMO } from '../lib/demo';
import { Ic } from './Icons';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', ico: 'grid' },
  { href: '/leads', label: 'Leads', ico: 'users' },
  { href: '/conversations', label: 'Conversations', ico: 'chat' },
  { href: '/catalog', label: 'Catalog', ico: 'grid' },
  { href: '/documents', label: 'Documents', ico: 'file' },
  { href: '/analytics', label: 'Analytics', ico: 'chart' },
  { href: '/staff', label: 'Staff', ico: 'user' },
  { href: '/followups', label: 'Scheduled Follow-ups', ico: 'calendar' },
  { href: '/bulk-message', label: 'Bulk Message', ico: 'zap' },
  { href: '/whatsapp', label: 'Connect WhatsApp', ico: 'phone' },
  { href: '/settings', label: 'Settings', ico: 'gear' },
];

export default function AuthShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState(DEMO ? { demo: true } : undefined);

  useEffect(() => {
    if (DEMO) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const isLogin = pathname === '/login';

  const logout = async () => {
    if (DEMO) { alert('Demo mode — no login session to sign out of.'); return; }
    await supabase.auth.signOut(); // onAuthStateChange clears the session → redirect to /login
  };

  useEffect(() => {
    if (session === null && !isLogin) router.replace('/login');
    if (session && isLogin) router.replace('/dashboard');
  }, [session, isLogin, router]);

  if (isLogin) return children;
  if (!session) return <div className="main muted">Loading…</div>;

  return (
    <div className="frame">
      <aside className="sidebar">
        <div className="logo" style={{ padding: '4px 6px 10px' }}>
          <img src="/logo.png" alt="SkyHigh Educational Services" style={{ width: '100%', maxWidth: 178, display: 'block' }} />
        </div>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={pathname.startsWith(l.href) ? 'active' : ''}>
            <Ic name={l.ico} size={17} /> {l.label}
          </Link>
        ))}
        <span className="push" />
        <div className="wa-pill">
          <Ic name="phone" size={15} />
          <span>WhatsApp Connected<small>{DEMO ? '+91 99067 12345' : 'live'}</small></span>
        </div>
        <button className="signout" onClick={logout}>
          <Ic name="logout" size={16} /> Sign out
        </button>
        <div className="ver" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <span>SkyHigh Educational Services · v1.0</span>
          <span style={{ fontSize: 10.5, opacity: 0.75 }}>Developed by BlinksAI</span>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

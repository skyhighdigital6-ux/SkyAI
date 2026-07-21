'use client';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setBusy(false); // success → AuthShell redirects to /leads
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img src="/logo.png" alt="Sky High Career Consultancy" style={{ width: 220, alignSelf: 'center', marginBottom: 6 }} />
        <h1 style={{ textAlign: 'center', fontSize: 18 }}>WhatsApp CRM</h1>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div className="err">{error}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="muted">Staff accounts are created by the admin in Supabase (Auth user + staff_users row).</div>
        <div className="muted" style={{ textAlign: 'center', fontSize: 11 }}>Developed by BlinksAI</div>
      </form>
    </div>
  );
}

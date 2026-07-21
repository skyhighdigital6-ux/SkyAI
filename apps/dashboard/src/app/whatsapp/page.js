'use client';
// Connect WhatsApp — non-technical pairing page. Shows live connection
// status; when disconnected, displays the QR to scan right on the page
// (auto-refreshing as WhatsApp rotates codes) and offers Disconnect when
// linked. All state comes from the backend's /whatsapp/status endpoint.
import { useCallback, useEffect, useState } from 'react';
import { backendApi } from '../../lib/backendApi';
import { DEMO } from '../../lib/demo';
import TopBar from '../../components/TopBar';

const STATUS_META = {
  connected: { label: 'Connected', cls: 'hot', dot: '🟢' },
  waiting_qr: { label: 'Waiting for QR scan', cls: 'warm', dot: '🟡' },
  reconnecting: { label: 'Reconnecting…', cls: 'warm', dot: '🟡' },
  starting: { label: 'Starting…', cls: 'cold', dot: '⚪' },
  offline: { label: 'Backend unreachable', cls: 'no', dot: '🔴' },
};

const fmtNumber = (n) =>
  n ? `+${n.slice(0, 2)} ${n.slice(2, 7)} ${n.slice(7)}` : '';

export default function WhatsAppConnect() {
  const [state, setState] = useState(DEMO ? { status: 'connected', number: '919906712345', qr: null } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (DEMO) return;
    try {
      setState(await backendApi('/whatsapp/status'));
      setError('');
    } catch (err) {
      setState({ status: 'offline', number: null, qr: null });
      setError(err.message);
    }
  }, []);

  // QR codes rotate every ~30s, so poll fast enough to always show a live one.
  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const disconnect = async () => {
    if (DEMO) { alert('Demo mode — connect Supabase + backend first.'); return; }
    if (!confirm(
      'Disconnect WhatsApp?\n\nThe bot will stop replying to students until a phone scans the new QR code.'
    )) return;
    setBusy(true);
    setError('');
    try {
      await backendApi('/whatsapp/disconnect', { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const meta = STATUS_META[state?.status] ?? STATUS_META.starting;

  return (
    <div>
      <TopBar />
      <div className="pagehead">
        <h1>Connect WhatsApp</h1>
        <span className="sub">Link the consultancy phone to the bot</span>
      </div>
      {error && <div className="banner red">{error}</div>}

      <div className="card" style={{ maxWidth: 560 }}>
        {!state && <div className="muted">Checking connection…</div>}

        {state && (
          <>
            <p style={{ marginBottom: 16 }}>
              <span className={`badge ${meta.cls}`}>{meta.dot} {meta.label}</span>
              {state.status === 'connected' && (
                <b style={{ marginLeft: 10 }}>{fmtNumber(state.number)}</b>
              )}
            </p>

            {state.status === 'connected' && (
              <>
                <p className="muted" style={{ marginBottom: 16 }}>
                  The bot is live on this number. Students who WhatsApp it get
                  automatic replies; conversations appear under Leads.
                </p>
                <button className="btn danger" onClick={disconnect} disabled={busy}>
                  {busy ? 'Disconnecting…' : 'Disconnect this WhatsApp'}
                </button>
              </>
            )}

            {state.status === 'waiting_qr' && (
              <>
                <p className="muted">Scan with the phone you want the bot to run on:</p>
                <ol style={{ margin: '10px 0 16px 18px', lineHeight: 1.9 }}>
                  <li>Open <b>WhatsApp</b> on that phone</li>
                  <li>Tap <b>⋮ (menu)</b> → <b>Linked devices</b></li>
                  <li>Tap <b>Link a device</b></li>
                  <li>Point the camera at this code</li>
                </ol>
                {state.qr
                  ? <img src={state.qr} alt="WhatsApp pairing QR" width={280} height={280}
                         style={{ display: 'block', borderRadius: 12, border: '1px solid #e5e7eb' }} />
                  : <div className="muted">Generating QR…</div>}
                <p className="muted" style={{ marginTop: 10 }}>
                  The code refreshes automatically — keep this page open while you scan.
                </p>
              </>
            )}

            {(state.status === 'reconnecting' || state.status === 'starting') && (
              <p className="muted">
                The bot is {state.status === 'starting' ? 'starting up' : 'reconnecting to WhatsApp'} —
                this usually takes a few seconds. If it stays stuck, check that the backend is running.
              </p>
            )}

            {state.status === 'offline' && (
              <p className="muted">
                The backend server is not reachable. Start it, then this page will
                update on its own.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

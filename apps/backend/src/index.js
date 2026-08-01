// Entry point — starts Express (dashboard API) and the Baileys WhatsApp
// connection in one persistent process. Railway keeps this alive and
// restarts it on crash; no PM2 needed.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { startWhatsApp } from './whatsapp/connection.js';
import { startFollowUpScheduler } from './pipeline/followUp.js';
import { startReminderScheduler } from './flow/reminders.js';
import { startWelcomeWorker } from './pipeline/welcomeQueue.js';
import { startDialer } from './voice/dialer.js';
import { voiceWebhook } from './voice/webhook.js';
import { cloudWebhook } from './whatsapp/cloudWebhook.js';
import { privacyHtml } from './privacy.js';
import { apiRoutes } from './api/routes.js';

const app = express();
app.use(cors()); // dashboard on Vercel calls this API cross-origin
// 25mb: bulk-message media (image/pdf/video) arrives as base64 JSON.
app.use(express.json({ limit: '25mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'skyai-backend' });
});

// Public privacy policy — required to publish the Meta/WhatsApp app. Mounted
// before /api so it stays anonymous (no staff auth) and is crawlable.
app.get('/privacy', (_req, res) => {
  res.type('html').set('Cache-Control', 'public, max-age=3600').send(privacyHtml());
});

// Voice-provider callbacks: no staff JWT, guarded by VOICE_WEBHOOK_SECRET.
// Mounted before /api so it isn't caught by requireStaff.
app.use('/webhooks/voice', voiceWebhook);

// WhatsApp Cloud API inbound (Meta POSTs here) — no staff JWT, guarded by
// WA_WEBHOOK_VERIFY_TOKEN during subscription. Also mounted before /api.
app.use('/webhooks/whatsapp', cloudWebhook);

app.use('/api', apiRoutes);

app.listen(config.port, () => {
  console.log(`[backend] Express listening on :${config.port}`);
});

startFollowUpScheduler();      // legacy AI "talk later" re-engagement (dormant unless used)
startReminderScheduler();      // counselling-flow stage-specific 8h no-reply reminder
startWelcomeWorker();          // reliable DB-backed welcome-message queue (bulk imports)
startDialer();                 // outbound voice campaigns (idle unless VOICE_API_KEY set)
await startWhatsApp();

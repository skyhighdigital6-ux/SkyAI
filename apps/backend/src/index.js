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
import { startDialer } from './voice/dialer.js';
import { voiceWebhook } from './voice/webhook.js';
import { apiRoutes } from './api/routes.js';

const app = express();
app.use(cors()); // dashboard on Vercel calls this API cross-origin
// 25mb: bulk-message media (image/pdf/video) arrives as base64 JSON.
app.use(express.json({ limit: '25mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'skyai-backend' });
});

// Voice-provider callbacks: no staff JWT, guarded by VOICE_WEBHOOK_SECRET.
// Mounted before /api so it isn't caught by requireStaff.
app.use('/webhooks/voice', voiceWebhook);

app.use('/api', apiRoutes);

app.listen(config.port, () => {
  console.log(`[backend] Express listening on :${config.port}`);
});

startFollowUpScheduler();      // legacy AI "talk later" re-engagement (dormant unless used)
startReminderScheduler();      // counselling-flow 8h/24h no-reply reminders
startDialer();                 // outbound voice campaigns (idle unless VOICE_API_KEY set)
await startWhatsApp();

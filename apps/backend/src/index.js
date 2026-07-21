// Entry point — starts Express (dashboard API) and the Baileys WhatsApp
// connection in one persistent process. Railway keeps this alive and
// restarts it on crash; no PM2 needed.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { startWhatsApp } from './whatsapp/connection.js';
import { startFollowUpScheduler } from './pipeline/followUp.js';
import { apiRoutes } from './api/routes.js';

const app = express();
app.use(cors()); // dashboard on Vercel calls this API cross-origin
// 25mb: bulk-message media (image/pdf/video) arrives as base64 JSON.
app.use(express.json({ limit: '25mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'skyai-backend' });
});

app.use('/api', apiRoutes);

app.listen(config.port, () => {
  console.log(`[backend] Express listening on :${config.port}`);
});

startFollowUpScheduler();
await startWhatsApp();

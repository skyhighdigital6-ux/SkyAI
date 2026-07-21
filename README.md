# SkyAI — WhatsApp Education Consultancy CRM

WhatsApp automation CRM for an abroad-medical-studies consultancy (MBBS in
Russia/Georgia/Kyrgyzstan/Philippines). A Baileys-powered bot handles student
inquiries end-to-end with dynamic tone mirroring, lead scoring, PDF brochures,
and human escalation — backed by a Next.js admin dashboard.

## Layout (npm workspaces monorepo)

| Path | What | Deploys to |
|---|---|---|
| `apps/backend` | Express + Baileys + Gemini/Groq bot | Railway (persistent process) |
| `apps/dashboard` | Next.js admin CRM dashboard | Vercel |
| `packages/shared` | Stages, temperature thresholds, AI JSON shape | imported by both |
| `supabase/migrations` | Postgres schema SQL | Supabase |

## Setup

```bash
npm install                      # installs all workspaces
cp .env.example .env             # fill in keys (see comments in the file)
npm run backend                  # start backend locally (port 3001)
npm run dashboard                # start dashboard locally (port 3000)
npm run test:gemini              # isolated AI test, no WhatsApp needed
npm run check:db                 # verify Supabase schema after running the migration
```

## Connecting the services (do once)

1. **Supabase**: create a project → SQL Editor → run `supabase/migrations/0001_initial_schema.sql`
   → copy URL + anon key + service-role key into `.env`.
2. **Gemini**: free key from https://aistudio.google.com/apikey → `GEMINI_API_KEY`.
3. **Groq** (fallback): free key from https://console.groq.com/keys → `GROQ_API_KEY`.
4. **WhatsApp**: `npm run backend` → scan the QR from the consultancy phone
   (WhatsApp → Linked Devices).
5. **Staff login**: Supabase → Authentication → Add user, then insert a row in
   `staff_users` with the same user id.

## Deploy targets

- **Railway** → root directory `apps/backend`, start command `npm start`.
  Must run as a long-lived process (Baileys holds an open WebSocket).
- **Vercel** → root directory `apps/dashboard`.
- Env vars per app are listed in [.env.example](.env.example).

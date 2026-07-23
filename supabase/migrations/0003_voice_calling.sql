-- ═══════════════════════════════════════════════════════════════════
-- AI Voice Calling platform — campaigns, contacts, calls, events.
--
-- Provider-agnostic: the real-time voice agent lives at a managed provider
-- (Vapi / Retell / Bland / ElevenLabs); this schema is the CRM + campaign
-- layer that drives it and stores every outcome. Safe to re-run.
-- Run in Supabase Dashboard → SQL Editor → paste → Run.
-- ═══════════════════════════════════════════════════════════════════

-- ── Reusable AI agent configurations (mirrors the provider's assistant) ──
create table if not exists voice_agents (
  id                bigint generated always as identity primary key,
  name              text not null,
  provider          text not null default 'vapi',
  provider_agent_id text,                    -- assistant/agent id at the provider
  language          text default 'en-IN',    -- primary language; agent may auto-detect
  voice             text,                    -- provider voice id
  system_prompt     text,
  first_message     text,
  transfer_number   text,                    -- live-agent handoff target
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ── Campaigns (outbound bulk, or an inbound answering config) ──────────
create table if not exists voice_campaigns (
  id                bigint generated always as identity primary key,
  name              text not null,
  direction         text not null default 'outbound' check (direction in ('outbound','inbound')),
  status            text not null default 'draft'
                    check (status in ('draft','scheduled','running','paused','completed','failed')),
  agent_id          bigint references voice_agents(id) on delete set null,
  from_number       text,                    -- caller ID / provider phone number id
  scheduled_at      timestamptz,             -- null = start immediately when set to running
  concurrency       integer not null default 3 check (concurrency between 1 and 100),
  max_attempts      integer not null default 1,
  call_window_start time not null default '09:00',
  call_window_end   time not null default '20:00',
  created_by        uuid references staff_users(id) on delete set null,
  created_at        timestamptz not null default now(),
  started_at        timestamptz,
  completed_at      timestamptz
);
create index if not exists voice_campaigns_status_idx on voice_campaigns (status);

-- ── Contacts queued in a campaign ──────────────────────────────────────
create table if not exists voice_contacts (
  id              bigint generated always as identity primary key,
  campaign_id     bigint not null references voice_campaigns(id) on delete cascade,
  lead_id         uuid references leads(id) on delete set null,
  name            text,
  phone           text not null,             -- digits incl. country code
  status          text not null default 'pending'
                  check (status in ('pending','queued','calling','completed','failed','no_answer','busy','dnd','skipped')),
  attempts        integer not null default 0,
  last_attempt_at timestamptz,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index if not exists voice_contacts_campaign_idx on voice_contacts (campaign_id, status);

-- ── One row per call attempt (inbound or outbound) ─────────────────────
create table if not exists voice_calls (
  id               bigint generated always as identity primary key,
  campaign_id      bigint references voice_campaigns(id) on delete set null,
  contact_id       bigint references voice_contacts(id) on delete set null,
  lead_id          uuid references leads(id) on delete set null,
  provider         text not null default 'vapi',
  provider_call_id text unique,              -- id at the provider (webhook key)
  direction        text not null default 'outbound' check (direction in ('outbound','inbound')),
  from_number      text,
  to_number        text,
  status           text not null default 'queued'
                   check (status in ('queued','ringing','in_progress','completed','failed','no_answer','busy','transferred','voicemail')),
  outcome          text,                     -- interested / not_interested / callback / transferred / …
  started_at       timestamptz,
  ended_at         timestamptz,
  duration_seconds integer,
  recording_url    text,
  transcript       text,
  summary          text,
  sentiment        text,                     -- positive / neutral / negative
  language         text,
  cost             numeric(10,4),
  created_at       timestamptz not null default now()
);
create index if not exists voice_calls_campaign_idx on voice_calls (campaign_id, status);
create index if not exists voice_calls_provider_idx on voice_calls (provider_call_id);
create index if not exists voice_calls_created_idx  on voice_calls (created_at desc);

-- ── Raw provider webhook events (audit / debugging) ────────────────────
create table if not exists voice_call_events (
  id               bigint generated always as identity primary key,
  call_id          bigint references voice_calls(id) on delete cascade,
  provider_call_id text,
  event_type       text,
  payload          jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists voice_events_call_idx on voice_call_events (provider_call_id);

-- ── Row Level Security ─────────────────────────────────────────────────
-- Backend uses the service-role key (bypasses RLS); dashboard = staff.
alter table voice_agents      enable row level security;
alter table voice_campaigns   enable row level security;
alter table voice_contacts    enable row level security;
alter table voice_calls       enable row level security;
alter table voice_call_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['voice_agents','voice_campaigns','voice_contacts','voice_calls','voice_call_events']
  loop
    execute format('drop policy if exists "staff read %1$s" on %1$s', t);
    execute format('drop policy if exists "staff write %1$s" on %1$s', t);
    execute format('create policy "staff read %1$s"  on %1$s for select to authenticated using (true)', t);
    execute format('create policy "staff write %1$s" on %1$s for all    to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ── Seed: a starter agent config you can edit in the dashboard ─────────
insert into voice_agents (name, language, first_message, system_prompt)
select 'SkyHigh Admission Counsellor',
       'en-IN',
       'Hello! This is SkyHigh Educational Services calling about college admissions. Is this a good time to talk?',
       'You are a warm, natural-sounding admission counsellor for SkyHigh Educational Services Pvt. Ltd., an Indian college-admission consultancy. Speak like a real person: short sentences, natural pauses, no robotic phrasing. Match the caller''s tone and energy — calm if they are calm, upbeat if they are excited, and always patient and empathetic if they are upset. Detect and continue in the caller''s language (English, Hindi or Hinglish). Ask relevant follow-up questions, remember what they said, and never repeat yourself. Your goal: understand their course and location preference, answer their questions honestly, and either book a counselling appointment or schedule a callback. Never invent fees, cut-offs or seat numbers — say a Career Expert will confirm exact details. If the caller asks for a human or becomes frustrated, offer to transfer them.'
where not exists (select 1 from voice_agents);

-- ═══════════════════════════════════════════════════════════════════
-- skyai — initial schema (Milestone 3)
-- Run this in Supabase Dashboard → SQL Editor → New query → paste → Run.
-- ═══════════════════════════════════════════════════════════════════

-- ── leads: one row per student = their complete CRM profile ─────────
create table if not exists leads (
  id                uuid primary key default gen_random_uuid(),
  whatsapp_number   text not null unique,          -- digits only, e.g. 919876543210
  name              text,
  current_stage     text not null default 'new' check (current_stage in (
                      'new','discovery','eligibility','brochure_sent','faq',
                      'documents','admission','escalated','closed_won','closed_lost')),
  interested_country text,
  interested_course  text,
  neet_status        text,                          -- e.g. "qualified 2025, 245 marks"
  academic_details   text,                          -- 12th PCB %, year, board
  budget_range       text,
  tone_profile       jsonb,                         -- running style profile (ToneProfile)
  lead_score         integer not null default 20 check (lead_score between 0 and 100),
  lead_temperature   text not null default 'Cold' check (lead_temperature in ('Hot','Warm','Cold')),
  needs_human        boolean not null default false, -- true → bot paused, staff handles
  documents_shared   jsonb not null default '[]',    -- [{doc, sent_at}]
  disclosure_sent    boolean not null default false, -- privacy notice sent early in convo
  last_active_at     timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

create index if not exists leads_score_idx    on leads (lead_score desc);
create index if not exists leads_stage_idx    on leads (current_stage);
create index if not exists leads_needs_human_idx on leads (needs_human) where needs_human;

-- ── messages: full transcript per lead ───────────────────────────────
create table if not exists messages (
  id            bigint generated always as identity primary key,
  lead_id       uuid not null references leads(id) on delete cascade,
  direction     text not null check (direction in ('inbound','outbound')),
  sender        text not null check (sender in ('student','bot','staff')),
  content       text,
  message_type  text not null default 'text'
                check (message_type in ('text','pdf','buttons','button_reply','system')),
  wa_message_id text,                              -- Baileys message key id
  created_at    timestamptz not null default now()
);

create index if not exists messages_lead_time_idx on messages (lead_id, created_at);

-- ── knowledge base (structured — the AI may ONLY state facts from here) ──
create table if not exists kb_countries (
  id            bigint generated always as identity primary key,
  country       text not null unique,              -- matches shared COUNTRIES ids, e.g. 'russia'
  display_name  text not null,                     -- "Russia"
  universities  jsonb not null default '[]',       -- [{name, city, annual_fee_inr, notes}]
  total_fee_range text,                            -- "₹25–35 lakh total (6 years)"
  duration      text,                              -- "6 years incl. internship"
  eligibility   text,                              -- NEET + PCB % requirements
  recognition   text,                              -- NMC/WHO/ECFMG status
  pros          text,
  cons          text,
  brochure_path text,                              -- Supabase Storage path (Milestone 7)
  is_active     boolean not null default true,
  updated_at    timestamptz not null default now()
);

create table if not exists kb_courses (
  id           bigint generated always as identity primary key,
  course       text not null unique,               -- 'mbbs' | 'bds' | 'nursing'
  display_name text not null,
  eligibility  text not null,
  notes        text,
  is_active    boolean not null default true,
  updated_at   timestamptz not null default now()
);

create table if not exists kb_faqs (
  id         bigint generated always as identity primary key,
  question   text not null,
  answer     text not null,
  category   text,                                 -- 'fees','visa','hostel','food','safety',...
  is_active  boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists kb_process_steps (
  id          bigint generated always as identity primary key,
  step_number integer not null unique,
  title       text not null,
  description text not null,
  updated_at  timestamptz not null default now()
);

-- ── staff (linked to Supabase Auth) ─────────────────────────────────
create table if not exists staff_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  role       text not null default 'counselor' check (role in ('admin','counselor')),
  created_at timestamptz not null default now()
);

-- ── ai_usage: daily provider counters for the dashboard quota banner ──
create table if not exists ai_usage (
  day             date primary key default current_date,
  gemini_requests integer not null default 0,
  groq_requests   integer not null default 0
);

-- ═══ Row Level Security ═════════════════════════════════════════════
-- Backend uses the service-role key (bypasses RLS). The dashboard uses the
-- anon key + Supabase Auth: any signed-in staff member gets read access,
-- and write access to KB tables + the lead fields staff edit from the UI.

alter table leads            enable row level security;
alter table messages         enable row level security;
alter table kb_countries     enable row level security;
alter table kb_courses       enable row level security;
alter table kb_faqs          enable row level security;
alter table kb_process_steps enable row level security;
alter table staff_users      enable row level security;
alter table ai_usage         enable row level security;

create policy "staff read leads"     on leads    for select to authenticated using (true);
create policy "staff update leads"   on leads    for update to authenticated using (true);
create policy "staff read messages"  on messages for select to authenticated using (true);
create policy "staff read usage"     on ai_usage for select to authenticated using (true);
create policy "staff read own row"   on staff_users for select to authenticated using (auth.uid() = id);

create policy "staff read kb_countries"  on kb_countries     for select to authenticated using (true);
create policy "staff write kb_countries" on kb_countries     for all    to authenticated using (true) with check (true);
create policy "staff read kb_courses"    on kb_courses       for select to authenticated using (true);
create policy "staff write kb_courses"   on kb_courses       for all    to authenticated using (true) with check (true);
create policy "staff read kb_faqs"       on kb_faqs          for select to authenticated using (true);
create policy "staff write kb_faqs"      on kb_faqs          for all    to authenticated using (true) with check (true);
create policy "staff read kb_steps"      on kb_process_steps for select to authenticated using (true);
create policy "staff write kb_steps"     on kb_process_steps for all    to authenticated using (true) with check (true);

-- ═══ Storage buckets ════════════════════════════════════════════════
-- brochures   → country/course PDFs the bot sends (Milestone 7)
-- wa-sessions → Baileys auth session backup (Milestone 12)
insert into storage.buckets (id, name, public)
values ('brochures', 'brochures', false), ('wa-sessions', 'wa-sessions', false)
on conflict (id) do nothing;

-- ═══ Placeholder KB data (replace with real data via the KB editor) ══
insert into kb_countries (country, display_name, universities, total_fee_range, duration, eligibility, recognition, pros, cons)
values (
  'russia', 'Russia',
  '[{"name":"Sample State Medical University","city":"Sample City","annual_fee_inr":"₹4.5 lakh/year","notes":"PLACEHOLDER — replace with real university"}]',
  'PLACEHOLDER: ₹25–35 lakh total (6 years)',
  '6 years including internship',
  'PLACEHOLDER: NEET qualified + 50% in PCB (12th)',
  'PLACEHOLDER: NMC & WHO recognized',
  'PLACEHOLDER: low fees, no donation, English medium',
  'PLACEHOLDER: cold climate, learn basic Russian for patient interaction'
)
on conflict (country) do nothing;

insert into kb_courses (course, display_name, eligibility)
values ('mbbs', 'MBBS', 'PLACEHOLDER: NEET qualified, 12th with PCB 50% (40% reserved categories), age 17+')
on conflict (course) do nothing;

insert into kb_faqs (question, answer, category) values
  ('Is NEET required for MBBS abroad?', 'PLACEHOLDER: Yes, NEET qualification is mandatory for Indian students to practice in India after MBBS abroad.', 'eligibility'),
  ('Kya wahan khana Indian milta hai?', 'PLACEHOLDER: Haan, zyada universities me Indian mess available hai.', 'food');

insert into kb_process_steps (step_number, title, description) values
  (1, 'Free counseling & eligibility check', 'PLACEHOLDER: Share NEET score, 12th marks and budget — we suggest the best-fit country and university.'),
  (2, 'Document collection', 'PLACEHOLDER: 10th & 12th marksheets, NEET scorecard, passport (or apply), photos.'),
  (3, 'University application & admission letter', 'PLACEHOLDER: We apply on your behalf; admission letter usually in 7–14 days.'),
  (4, 'Visa processing', 'PLACEHOLDER: Invitation letter, visa filing and documentation handled by us.'),
  (5, 'Travel & arrival support', 'PLACEHOLDER: Ticket booking, airport pickup and hostel allotment.')
on conflict (step_number) do nothing;

-- ═══════════════════════════════════════════════════════════════════
-- skyhigh — deterministic admission-counselling flow (Course → State →
-- College → documents → counsellor handover) + no-reply reminders.
--
-- Adds the admin-managed catalog the WhatsApp menu flow reads from and the
-- per-lead conversation state it needs. Safe to re-run (idempotent).
-- Run in Supabase Dashboard → SQL Editor → paste → Run.
-- ═══════════════════════════════════════════════════════════════════

-- ── 0. Back-fill columns the existing AI follow-up code already expects ──
-- (0001 shipped without these; the follow-up scheduler references them.)
alter table leads add column if not exists follow_up_date timestamptz;
alter table leads add column if not exists follow_up_sent boolean not null default false;

-- ── 1. Admin-managed catalog ─────────────────────────────────────────
create table if not exists courses (
  id            bigint generated always as identity primary key,
  name          text not null,                       -- shown in the WhatsApp menu
  is_active     boolean not null default true,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists states (
  id            bigint generated always as identity primary key,
  name          text not null,
  is_active     boolean not null default true,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists colleges (
  id            bigint generated always as identity primary key,
  name          text not null,
  state_id      bigint references states(id) on delete set null,
  course_ids    bigint[] not null default '{}',      -- courses this college offers
  is_active     boolean not null default true,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists colleges_state_idx  on colleges (state_id);
create index if not exists colleges_course_idx on colleges using gin (course_ids);

-- Brochure / fee-structure / other docs, versioned by academic year. The flow
-- sends only the latest ACTIVE row per (college, doc_type).
create table if not exists college_documents (
  id            bigint generated always as identity primary key,
  college_id    bigint not null references colleges(id) on delete cascade,
  doc_type      text not null default 'brochure'
                check (doc_type in ('brochure','fee_structure','other')),
  academic_year text,                                 -- e.g. "2026-27"
  storage_path  text not null,                        -- path in the 'brochures' bucket
  file_name     text,                                 -- caption / download name
  is_active     boolean not null default true,
  uploaded_at   timestamptz not null default now()
);
create index if not exists college_docs_idx on college_documents (college_id, doc_type, is_active);

-- Career experts shown at handover (photo + call/WhatsApp number).
create table if not exists counsellors (
  id                 bigint generated always as identity primary key,
  name               text not null,                  -- "Prakash Sir"
  title              text,                            -- "Career Expert"
  phone              text,                            -- "6200513372"
  photo_path         text,                            -- path in 'counsellor-photos' bucket
  instagram          text,
  is_default_callback boolean not null default false, -- gets Request-a-Callback leads
  is_active          boolean not null default true,
  display_order      integer not null default 0,
  created_at         timestamptz not null default now()
);

-- Small key/value store for global flow settings (Instagram handle, etc.).
create table if not exists app_settings (
  key   text primary key,
  value text
);

-- Idempotency guard — WhatsApp/Baileys can redeliver the same message id.
create table if not exists processed_wa_messages (
  wa_message_id text primary key,
  created_at    timestamptz not null default now()
);

-- ── 2. Per-lead conversation state for the menu flow ─────────────────
alter table leads add column if not exists entry_source         text;
alter table leads add column if not exists flow_step            text;      -- FSM position (null = not started)
alter table leads add column if not exists flow_status          text;      -- human-readable lead status
alter table leads add column if not exists selected_course_id   bigint;
alter table leads add column if not exists selected_state_id    bigint;
alter table leads add column if not exists selected_college_id  bigint;
alter table leads add column if not exists other_course         text;
alter table leads add column if not exists other_state          text;
alter table leads add column if not exists other_college        text;
alter table leads add column if not exists assigned_counsellor_id bigint;
alter table leads add column if not exists college_page         integer not null default 0;
alter table leads add column if not exists unrecognized_count   integer not null default 0;
alter table leads add column if not exists last_bot_message_at  timestamptz;
alter table leads add column if not exists reminder_8h_sent     boolean not null default false;
alter table leads add column if not exists reminder_24h_sent    boolean not null default false;
alter table leads add column if not exists automation_paused    boolean not null default false;
alter table leads add column if not exists opted_out            boolean not null default false;
alter table leads add column if not exists flow_documents_sent  jsonb not null default '[]';
alter table leads add column if not exists not_interested_reason text;

-- ── 3. Storage buckets ───────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('counsellor-photos', 'counsellor-photos', true)   -- public → dashboard preview + Baileys
on conflict (id) do nothing;
-- 'brochures' (private) already exists from 0001 and holds college_documents.

-- ── 4. Row Level Security ────────────────────────────────────────────
-- Backend uses the service-role key (bypasses RLS). Dashboard = authenticated
-- staff who fully manage the catalog.
alter table courses            enable row level security;
alter table states             enable row level security;
alter table colleges           enable row level security;
alter table college_documents  enable row level security;
alter table counsellors        enable row level security;
alter table app_settings       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['courses','states','colleges','college_documents','counsellors','app_settings']
  loop
    execute format('drop policy if exists "staff read %1$s" on %1$s', t);
    execute format('drop policy if exists "staff write %1$s" on %1$s', t);
    execute format('create policy "staff read %1$s"  on %1$s for select to authenticated using (true)', t);
    execute format('create policy "staff write %1$s" on %1$s for all    to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Storage policies so staff can upload/manage docs + photos from the dashboard.
do $$
begin
  begin
    create policy "staff manage brochures" on storage.objects for all to authenticated
      using (bucket_id = 'brochures') with check (bucket_id = 'brochures');
  exception when duplicate_object then null; end;
  begin
    create policy "staff manage counsellor photos" on storage.objects for all to authenticated
      using (bucket_id = 'counsellor-photos') with check (bucket_id = 'counsellor-photos');
  exception when duplicate_object then null; end;
  begin
    create policy "public read counsellor photos" on storage.objects for select to anon
      using (bucket_id = 'counsellor-photos');
  exception when duplicate_object then null; end;
end $$;

-- ── 5. Seed: counsellors, Instagram handle, a couple of example courses ──
insert into counsellors (name, title, phone, instagram, is_default_callback, display_order)
select 'Prakash Sir', 'Career Expert', '6200513372', 'skyhigheducationalservices', true, 1
where not exists (select 1 from counsellors where phone = '6200513372');

insert into counsellors (name, title, phone, instagram, is_default_callback, display_order)
select 'Supriya Mam', 'Career Counselor', '9973234773', 'skyhigheducationalservices', false, 2
where not exists (select 1 from counsellors where phone = '9973234773');

insert into app_settings (key, value) values
  ('instagram_handle', 'skyhigheducationalservices')
on conflict (key) do nothing;

-- Example courses so the menu isn't empty before you add the real catalog.
insert into courses (name, display_order)
select v.name, v.ord from (values
  ('MBBS', 1), ('BDS (Dental)', 2), ('B.Tech / Engineering', 3),
  ('Nursing', 4), ('BAMS / BHMS', 5), ('Pharmacy', 6)
) as v(name, ord)
where not exists (select 1 from courses);

-- ═══════════════════════════════════════════════════════════════════
-- Engagement automation: reliable welcome queue + delivery status,
-- Hot/Warm counsellor notifications, richer follow-up state.
-- Safe to re-run. Run in Supabase Dashboard → SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- ── Welcome-message queue + delivery status on the lead ──────────────
-- welcome_status: null (not queued) | pending | sent | delivered | read | failed
alter table leads add column if not exists welcome_status   text;
alter table leads add column if not exists welcome_attempts integer not null default 0;
alter table leads add column if not exists welcome_error    text;
alter table leads add column if not exists welcome_wa_id    text;   -- Baileys msg id (for delivery/read receipts)
alter table leads add column if not exists welcomed_at      timestamptz;
create index if not exists leads_welcome_status_idx on leads (welcome_status) where welcome_status = 'pending';
create index if not exists leads_welcome_wa_idx on leads (welcome_wa_id);

-- ── Counsellor-notification de-dupe state on the lead ────────────────
alter table leads add column if not exists notified_temperature text;   -- last temp we alerted about (Warm/Hot)
alter table leads add column if not exists notified_college_id  bigint; -- last college we alerted about
alter table leads add column if not exists notified_at          timestamptz;

-- ── Log of every counsellor notification sent ───────────────────────
create table if not exists counselor_notifications (
  id            bigint generated always as identity primary key,
  lead_id       uuid references leads(id) on delete cascade,
  counsellor_id bigint references counsellors(id) on delete set null,
  phone         text,
  kind          text,                 -- Hot | Warm | college | assistance
  result        text,                 -- sent | failed
  error         text,
  wa_id         text,
  created_at    timestamptz not null default now()
);
create index if not exists counselor_notif_lead_idx on counselor_notifications (lead_id);

alter table counselor_notifications enable row level security;
do $$
begin
  begin
    create policy "staff read counselor_notifications" on counselor_notifications
      for select to authenticated using (true);
  exception when duplicate_object then null; end;
end $$;

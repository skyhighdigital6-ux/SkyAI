-- ═══════════════════════════════════════════════════════════════════
-- Deterministic lead scoring + fast sorting.
--
-- Score reflects the furthest engagement action (monotonic, never drops):
--   not delivered 0 · delivered 10 · replied 20 · course 30 · state 50 · college 70
-- Table sorts by score desc, then last_active_at desc.
-- Safe to re-run. Run in Supabase Dashboard → SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- New leads start at 0 (welcome not yet delivered) instead of the old default 20.
alter table leads alter column lead_score set default 0;

-- Composite index backing the "score, then most-recently-active" sort.
create index if not exists leads_score_active_idx on leads (lead_score desc, last_active_at desc);
create index if not exists leads_created_idx       on leads (created_at desc);

-- Backfill existing leads onto the new scheme from their current flow state.
-- "Replied = 20" is keyed off an actual inbound student message (NOT flow_step,
-- which the welcome worker sets even for delivered-but-never-replied leads).
update leads l set
  lead_score = case
    when selected_college_id is not null or other_college is not null then 70
    when selected_state_id  is not null or other_state  is not null then 50
    when selected_course_id is not null or other_course is not null then 30
    when exists (select 1 from messages m where m.lead_id = l.id and m.sender = 'student') then 20
    when welcome_status in ('sent','delivered','read') then 10
    else 0 end,
  lead_temperature = case
    when selected_college_id is not null or other_college is not null then 'Hot'
    when (selected_state_id is not null or other_state is not null)
      or (selected_course_id is not null or other_course is not null) then 'Warm'
    else 'Cold' end;

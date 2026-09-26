-- ============================================================================
-- FPL projection snapshots (applied live 26 Sep 2026): an append-only record
-- of what the model said BEFORE each gameweek deadline.
--
-- Why: fpl_player_projections is overwritten on every refresh, and every
-- stored projection for a played match (3,328 at 26 Sep) had been generated
-- after kick-off by a backfill -- from an earlier pipeline version, whose
-- player goals summed to 2.29/match against the teams' 2.93. There was no
-- honest pre-match record to score the model, or any change to it, against.
--
-- Scheduler: every 10 minutes. 'pre_deadline' once a gameweek is inside 60
-- minutes of its deadline (the final pre-deadline refresh); 'late' fallback
-- if that window was missed, only while no match has kicked off. 'manual'
-- for ad-hoc captures (GW6 baseline taken 26 Sep, two weeks out).
-- Tested: GW6 10 fixtures / 1,325 player rows; repeat adds nothing; UPDATE
-- and DELETE refused.
-- ============================================================================

create table public.fpl_projection_snapshots (
  snapshot_row_id bigint generated always as identity primary key,
  season_id bigint not null,
  fpl_event_id int not null,
  snapshot_kind text not null check (snapshot_kind in ('pre_deadline', 'late', 'manual')),
  snapshot_at timestamptz not null default now(),
  deadline_time timestamptz not null,
  fixture_id bigint not null,
  fpl_player_id bigint not null,
  model_version text not null,
  projection_generated_at timestamptz,
  expected_minutes numeric, start_probability numeric, sub_appearance_probability numeric,
  availability_probability numeric, lineup_confidence numeric, minutes_source text, tactical_role text,
  expected_goals numeric, expected_assists numeric, clean_sheet_probability numeric, expected_saves numeric,
  defensive_contribution_probability numeric, expected_bonus numeric,
  xpts_appearance numeric, xpts_goals numeric, xpts_assists numeric, xpts_clean_sheet numeric, xpts_saves numeric,
  xpts_defensive_contribution numeric, xpts_cards_own_goals numeric, xpts_bonus numeric, xpts_goals_conceded numeric,
  xpts_penalties numeric, expected_fpl_points numeric,
  unique (season_id, fpl_event_id, snapshot_kind, fixture_id, fpl_player_id, model_version)
);
create index fpl_projection_snapshots_event on public.fpl_projection_snapshots (season_id, fpl_event_id);

create table public.fpl_projection_fixture_snapshots (
  snapshot_row_id bigint generated always as identity primary key,
  season_id bigint not null,
  fpl_event_id int not null,
  snapshot_kind text not null check (snapshot_kind in ('pre_deadline', 'late', 'manual')),
  snapshot_at timestamptz not null default now(),
  deadline_time timestamptz not null,
  fixture_id bigint not null,
  predicted_home_goals numeric,
  predicted_away_goals numeric,
  kickoff_date date,
  kickoff_time time,
  unique (season_id, fpl_event_id, snapshot_kind, fixture_id)
);

create or replace function public.refuse_snapshot_changes()
returns trigger language plpgsql set search_path to pg_catalog as $$
begin
  raise exception 'Projection snapshots are append-only: % refused on %', tg_op, tg_table_name;
end;
$$;
create trigger fpl_projection_snapshots_append_only before update or delete on public.fpl_projection_snapshots
  for each row execute function public.refuse_snapshot_changes();
create trigger fpl_projection_fixture_snapshots_append_only before update or delete on public.fpl_projection_fixture_snapshots
  for each row execute function public.refuse_snapshot_changes();

alter table public.fpl_projection_snapshots enable row level security;
alter table public.fpl_projection_fixture_snapshots enable row level security;
create policy "Public read access" on public.fpl_projection_snapshots for select to anon, authenticated using (true);
create policy "Public read access" on public.fpl_projection_fixture_snapshots for select to anon, authenticated using (true);

-- snapshot_fpl_projections(season, event, kind) and snapshot_due_fpl_projections():
-- definitions in supabase/definitions/functions/ (exported from live).

select cron.schedule('snapshot-fpl-projections', '*/10 * * * *', $$select public.snapshot_due_fpl_projections();$$)
where not exists (select 1 from cron.job where jobname = 'snapshot-fpl-projections');

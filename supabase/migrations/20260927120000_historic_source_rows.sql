-- ============================================================================
-- historic_source_rows: scratch staging for the 1992/93-2013/14 history load
--
-- One row per match row in each source file, as parsed by
-- scripts/stage_history_sources.py (workflow stage-history-sources.yml):
--   * football-data.co.uk /mmz4281/<label>/E0..E3.csv, 1993/94-2013/14
--   * engsoccerdata england.csv, tiers 1-4, seasons 1992-2013
-- Used to map every club name to a team (by aligning the two sources'
-- fixtures on date and score) and to cross-check every imported result.
-- Not read by the site or the model. Layer 'scratch': drop once the history
-- load is verified (see docs/history-backfill.md).
--
-- Admin-only: RLS on with an is_admin() read policy; the loader uses the
-- service role. No anon/authenticated grants beyond what the policy needs.
-- ============================================================================

create table if not exists public.historic_source_rows (
  historic_source_row_id bigint generated always as identity primary key,
  source_name text not null check (source_name in ('football-data.co.uk', 'engsoccerdata')),
  league_code text not null check (league_code in ('E0', 'E1', 'E2', 'E3')),
  season_start_year integer not null,
  row_number integer not null,
  match_date date,
  home_name text not null,
  away_name text not null,
  home_goals integer,
  away_goals integer,
  result text,
  ht_home_goals integer,
  ht_away_goals integer,
  has_stats boolean not null default false,
  has_odds boolean not null default false,
  loaded_at timestamptz not null default now(),
  unique (source_name, league_code, season_start_year, row_number)
);

alter table public.historic_source_rows enable row level security;

drop policy if exists historic_source_rows_admin_read on public.historic_source_rows;
create policy historic_source_rows_admin_read on public.historic_source_rows
  for select to authenticated using (public.is_admin());

grant select on public.historic_source_rows to authenticated;
-- The default privileges give service_role SELECT only; the loader deletes
-- and inserts (first run failed with 42501 on DELETE).
grant select, insert, update, delete on public.historic_source_rows to service_role;

create index if not exists historic_source_rows_lookup
  on public.historic_source_rows (league_code, season_start_year, match_date);

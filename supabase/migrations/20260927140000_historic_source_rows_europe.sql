-- ============================================================================
-- historic_source_rows_europe: scratch staging for the European league history
-- load (docs/history-backfill.md, "European leagues").
--
-- scripts/history_backfill.py `stage-eu` fills it from football-data.co.uk
-- (per-season files for SP1, D1, I1, F1, P1, B1, T1, G1, N1, SC0 and the
-- all-seasons files for AUT, DNK, NOR, POL, ROU, SWE, SWZ, FIN) and from
-- engsoccerdata's country files (tier 1), so club names can be mapped and
-- every result cross-checked in SQL before and after the import.
--
-- Kept apart from historic_source_rows (English load) so the two loads, run in
-- parallel, never touch each other's constraint or rows. Not read by the
-- site: no anon/authenticated grants; RLS on with no policies.
-- Drop once the load is signed off.
-- ============================================================================

create table if not exists public.historic_source_rows_europe (
  historic_source_row_id bigint generated always as identity primary key,
  source_name text not null check (source_name in ('football-data.co.uk', 'engsoccerdata')),
  league_code text not null check (league_code in (
    'SP1', 'D1', 'I1', 'F1', 'P1', 'B1', 'T1', 'G1', 'N1', 'SC0',
    'AUT', 'DNK', 'NOR', 'POL', 'ROU', 'SWE', 'SWZ', 'FIN')),
  season_start_year integer not null,
  row_number integer not null,
  season_raw text,            -- the all-seasons files' Season value, e.g. '2016/2017' or '2016'
  match_date date,
  kickoff_time text,
  home_name text not null,
  away_name text not null,
  home_goals integer,
  away_goals integer,
  result text,
  ht_home_goals integer,
  ht_away_goals integer,
  has_stats boolean,
  has_odds boolean,
  note text,                  -- engsoccerdata round/division; all-seasons play-off exclusion reason
  loaded_at timestamptz not null default now(),
  unique (source_name, league_code, season_start_year, row_number)
);

alter table public.historic_source_rows_europe enable row level security;
revoke all on public.historic_source_rows_europe from anon, authenticated;
grant select, insert, delete on public.historic_source_rows_europe to service_role;

comment on table public.historic_source_rows_europe is
  'Scratch: football-data.co.uk and engsoccerdata rows for the European league history load (scripts/history_backfill.py stage-eu). Drop once signed off.';

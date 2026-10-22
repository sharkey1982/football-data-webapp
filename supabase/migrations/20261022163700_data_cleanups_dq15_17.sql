-- Audit 22 Oct 2026, low-severity data clean-ups (DQ-15, DQ-16, DQ-17).
-- Every statement is safe to re-run: each UPDATE only touches rows still in
-- the bad state, the alias insert skips existing rows, and the trigger is
-- created with CREATE OR REPLACE / DROP IF EXISTS.

-- ---------------------------------------------------------------------------
-- DQ-15: projection rows that contradict themselves (GW4, fixture 36).
-- 61 rows (leaguewide_v4 19, prototype_v3 19, leaguewide_v6 23) store
-- start_probability = 0, sub_appearance_probability = 0 and
-- xpts_appearance = 0 -- the player does not appear -- yet carry
-- expected_minutes up to 1.4 and minutes-driven components, which made 9 of
-- the v6 totals negative (-0.001 to -0.011). A player who cannot appear
-- scores 0 in every component, so the row's own probabilities settle the
-- value: set the minutes-driven fields and the total to 0. Rows with a
-- non-zero appearance probability are left alone (a negative total is
-- possible there: goals-conceded and card deductions, e.g. leaguewide_v4
-- fixture 67).
update public.fpl_player_projections
set expected_minutes = 0,
    expected_goals = 0,
    expected_assists = 0,
    clean_sheet_probability = 0,
    expected_saves = 0,
    defensive_contribution_probability = 0,
    expected_bonus = 0,
    xpts_goals = 0,
    xpts_assists = 0,
    xpts_clean_sheet = 0,
    xpts_saves = 0,
    xpts_defensive_contribution = 0,
    xpts_cards_own_goals = 0,
    xpts_bonus = 0,
    xpts_goals_conceded = 0,
    xpts_penalties = case when xpts_penalties is null then null else 0 end,
    expected_fpl_points = 0
where coalesce(start_probability, 0) = 0
  and coalesce(sub_appearance_probability, 0) = 0
  and coalesce(xpts_appearance, 0) = 0
  and expected_minutes >= 0.01;

-- ---------------------------------------------------------------------------
-- DQ-16: shots on target greater than shots (16 historic football-data.co.uk
-- rows, 2000/01 to 2024/25). No other source in the database carries team
-- shots for these matches, so the true values cannot be recovered: null the
-- inconsistent side's pair (shots and shots on target together), keeping the
-- other side where it is consistent.
--
-- A BEFORE trigger applies the same rule to every future write, so a
-- re-import of these CSVs (history_backfill.py, import-daily.ts upsert on
-- the natural key) cannot bring the impossible pairs back and cannot fail
-- on them either.
create or replace function private.matches_null_inconsistent_shots()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.home_shots_on_target > new.home_shots then
    new.home_shots := null;
    new.home_shots_on_target := null;
  end if;
  if new.away_shots_on_target > new.away_shots then
    new.away_shots := null;
    new.away_shots_on_target := null;
  end if;
  return new;
end;
$$;

revoke all on function private.matches_null_inconsistent_shots() from public, anon, authenticated;

drop trigger if exists matches_null_inconsistent_shots on public.matches;
create trigger matches_null_inconsistent_shots
  before insert or update of home_shots, home_shots_on_target, away_shots, away_shots_on_target
  on public.matches
  for each row execute function private.matches_null_inconsistent_shots();

update public.matches
set home_shots = null, home_shots_on_target = null
where home_shots_on_target > home_shots;

update public.matches
set away_shots = null, away_shots_on_target = null
where away_shots_on_target > away_shots;

-- ---------------------------------------------------------------------------
-- DQ-17: explicit FixtureDownload aliases for the four European teams that
-- only matched through the canonical-name fallback in refresh_fixture_feeds.
-- Raw names checked against the live champions-league-2026 feed on
-- 22 Oct 2026 (they currently equal the canonical names, so a later rename
-- of the canonical name would silently unmap them).
insert into public.team_aliases (team_id, source_name, raw_name)
select v.team_id, 'FixtureDownload', v.raw_name
from (values
  (169::bigint, 'S. Bratislava'),
  (170::bigint, 'Sabah'),
  (171::bigint, 'Shakhtar'),
  (172::bigint, 'Slavia Praha')
) as v(team_id, raw_name)
join public.teams t on t.team_id = v.team_id
on conflict (source_name, raw_name) do nothing;

-- DQ-17: tennis status typos from the tennis-data.co.uk Comment column.
-- tennis.result_of() already maps both, so ratings and summaries do not
-- change; this fixes the stored text that pages and exports read directly.
-- scripts/tennis_import.py now normalises them on import too.
update tennis.matches set status = 'Retired' where status = 'Rrtired';
update tennis.matches set status = 'Walkover' where status = 'Walkoer';

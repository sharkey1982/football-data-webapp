-- ============================================================================
-- Premier League results within minutes of full time (Chris, 25 Oct 2026:
-- Man City lost at Villa on Saturday evening and the site showed nothing until
-- the next morning's feed).
--
-- FPL's live feed (fpl_live_fixtures, fetched every minute during games by
-- fpl_live_tick) has the score; at the final whistle (finished_provisional) it
-- is written to the fixture's reported score -- the same "provisional"
-- display path the fixture feeds already use (20260927223000): shown as
-- provisional on fixtures, results, team and match pages and listed under
-- the league table; never read by league tables, the model, history or the X
-- posts, which use confirmed results (matches) only.
--
-- Precedence:
--  * a confirmed result (matches) always wins: no reported score is written
--    once one exists;
--  * FPL fills the reported score when there is none, or updates its own
--    (reported_source 'fpl_live') if FPL corrects it;
--  * the FixtureDownload feed may still overwrite it on its daily run (both
--    normally agree; check_model_integrity's reported_vs_confirmed compares
--    whichever is there against the confirmed result).
-- The fixture becomes 'played' at the same time (fixtures_status_honest
-- accepts it because a reported score is present).
-- Safe to re-run.
-- ============================================================================

create or replace function public.sync_pl_reported_from_fpl()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  with src as (
    select f.fixture_id,
           coalesce(lf.team_h_score, ff.team_h_score) hg,
           coalesce(lf.team_a_score, ff.team_a_score) ag
      from public.fpl_fixtures ff
      join public.fixtures f on f.fixture_id = ff.canonical_fixture_id and f.season_id = ff.season_id
      join public.fpl_teams th on th.season_id = ff.season_id and th.fpl_team_id = ff.fpl_home_team_id
      join public.fpl_teams ta on ta.season_id = ff.season_id and ta.fpl_team_id = ff.fpl_away_team_id
      left join public.fpl_live_fixtures lf on lf.season_id = ff.season_id and lf.fpl_fixture_id = ff.fpl_fixture_id
     where ff.kickoff_time > now() - interval '14 days' and ff.kickoff_time < now()
       and (coalesce(lf.finished_provisional, false) or coalesce(ff.finished, false))
       -- FPL's home side is the fixture's home side (never write a reversed score).
       and th.canonical_team_id = f.home_team_id and ta.canonical_team_id = f.away_team_id)
  update public.fixtures f
     set reported_home_goals = s.hg, reported_away_goals = s.ag, reported_at = now(), reported_source = 'fpl_live',
         status = case when f.status in ('scheduled', 'awaiting_result') then 'played' else f.status end,
         updated_at = now()
    from src s
   where f.fixture_id = s.fixture_id
     and s.hg is not null and s.ag is not null
     and f.status <> 'postponed'
     and (f.reported_home_goals is null or f.reported_source = 'fpl_live')
     and (f.reported_home_goals is distinct from s.hg or f.reported_away_goals is distinct from s.ag
          or f.status in ('scheduled', 'awaiting_result'))
     and not private.fixture_has_result(f.league_id, f.season_id, f.home_team_id, f.away_team_id, f.kickoff_date);
  get diagnostics v_n = row_count;

  -- A score already reported by another source (FixtureDownload) on a game FPL
  -- says has finished: keep that score, just mark the fixture played so it shows.
  update public.fixtures f
     set status = 'played', updated_at = now()
    from public.fpl_fixtures ff
    left join public.fpl_live_fixtures lf on lf.season_id = ff.season_id and lf.fpl_fixture_id = ff.fpl_fixture_id
   where f.fixture_id = ff.canonical_fixture_id and f.season_id = ff.season_id
     and ff.kickoff_time > now() - interval '14 days' and ff.kickoff_time < now()
     and (coalesce(lf.finished_provisional, false) or coalesce(ff.finished, false))
     and f.status in ('scheduled', 'awaiting_result')
     and f.reported_home_goals is not null and f.reported_away_goals is not null;
  return v_n;
end;
$$;
comment on function public.sync_pl_reported_from_fpl() is
  'Writes FPL''s final-whistle score into fixtures.reported_* (source fpl_live) for Premier League games with no confirmed result yet; called by triggers on fpl_live_fixtures and fpl_fixtures (25 Oct 2026).';
revoke all on function public.sync_pl_reported_from_fpl() from public, anon, authenticated;

create or replace function private.fpl_live_results_to_fixtures()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Never break fpl_live_tick / refresh_fpl: a failure is a warning; the next
  -- minute's tick tries again.
  begin
    perform public.sync_pl_reported_from_fpl();
  exception when others then
    raise warning 'sync_pl_reported_from_fpl failed: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists fpl_live_fixtures_results on public.fpl_live_fixtures;
create trigger fpl_live_fixtures_results
  after insert or update on public.fpl_live_fixtures
  for each statement execute function private.fpl_live_results_to_fixtures();
drop trigger if exists fpl_fixtures_results on public.fpl_fixtures;
create trigger fpl_fixtures_results
  after insert or update on public.fpl_fixtures
  for each statement execute function private.fpl_live_results_to_fixtures();

-- Games already finished (GW8 so far).
select public.sync_pl_reported_from_fpl();

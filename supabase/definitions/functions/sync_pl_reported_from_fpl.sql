-- Live definition exported from the database (function sync_pl_reported_from_fpl()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.sync_pl_reported_from_fpl()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

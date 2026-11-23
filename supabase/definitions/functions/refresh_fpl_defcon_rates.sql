-- Live definition exported from the database (function refresh_fpl_defcon_rates()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_fpl_defcon_rates()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_season bigint := public.fpl_current_season_id();
  v_count integer;
begin
  delete from public.fpl_defcon_player_rates where season_id = v_season;
  with lines as (
    select distinct on (l.home_team_id, l.away_team_id) l.home_team_id, l.away_team_id, l.p_home, l.p_draw, l.p_away, l.p_over
      from public.market_closing_lines l
     where l.league_id = 1 and l.season_id = v_season
       and l.p_home is not null and l.p_draw is not null and l.p_away is not null and l.p_over is not null
     order by l.home_team_id, l.away_team_id, l.match_date desc
  ), shares as (
    select ln.home_team_id, ln.away_team_id, x.lambda_home / (x.lambda_home + x.lambda_away) as home_share
      from lines ln
      cross join lateral public.market_goal_lambdas(ln.p_home::double precision, ln.p_draw::double precision,
                                                    ln.p_away::double precision, ln.p_over::double precision) x
  ), fx as (
    select f.fpl_fixture_id, s.home_share
      from public.fpl_fixtures f
      join public.fpl_teams th on th.season_id = f.season_id and th.fpl_team_id = f.fpl_home_team_id
      join public.fpl_teams ta on ta.season_id = f.season_id and ta.fpl_team_id = f.fpl_away_team_id
      join shares s on s.home_team_id = th.canonical_team_id and s.away_team_id = ta.canonical_team_id
     where f.season_id = v_season
  ), g as (
    select g.fpl_player_id, g.minutes,
           coalesce((g.source_payload -> 'stats' ->> 'clearances_blocks_interceptions')::int, 0) as cbi,
           coalesce((g.source_payload -> 'stats' ->> 'tackles')::int, 0) as tackles,
           coalesce((g.source_payload -> 'stats' ->> 'recoveries')::int, 0) as recoveries,
           case when fx.home_share is null then null when g.was_home then fx.home_share else 1 - fx.home_share end as share
      from public.fpl_player_gameweeks g
      left join fx on fx.fpl_fixture_id = g.fpl_fixture_id
     where g.season_id = v_season and g.minutes > 0
  ), cur as (
    select fpl_player_id, count(*)::int as apps, sum(minutes)::int as minutes, sum(cbi)::int as cbi,
           sum(tackles)::int as tackles, sum(recoveries)::int as recoveries,
           coalesce(sum(minutes) filter (where share is not null), 0)::int as share_minutes,
           coalesce(sum(minutes * share) filter (where share is not null), 0) as share_sum
      from g group by fpl_player_id
  )
  insert into public.fpl_defcon_player_rates (season_id, fpl_player_id, fpl_code, appearances, minutes, cbi, tackles,
                                              recoveries, share_minutes, share_sum, updated_at)
  select v_season, p.fpl_player_id, p.fpl_code,
         coalesce(c.apps, 0) + coalesce(h.appearances, 0),
         coalesce(c.minutes, 0) + coalesce(h.minutes, 0),
         coalesce(c.cbi, 0) + coalesce(h.cbi, 0),
         coalesce(c.tackles, 0) + coalesce(h.tackles, 0),
         coalesce(c.recoveries, 0) + coalesce(h.recoveries, 0),
         coalesce(c.share_minutes, 0) + coalesce(h.share_minutes, 0),
         coalesce(c.share_sum, 0) + coalesce(h.share_sum, 0),
         now()
    from public.fpl_players p
    left join cur c on c.fpl_player_id = p.fpl_player_id
    left join public.fpl_defcon_history_2025_26 h on h.fpl_code = p.fpl_code
   where p.season_id = v_season
     and (c.fpl_player_id is not null or h.fpl_code is not null);
  get diagnostics v_count = row_count;
  return v_count;
end $function$
;

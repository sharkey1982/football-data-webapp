-- Live definition exported from the database (function get_day_page(p_day date)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_day_page(p_day date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with g as (
    select f.fixture_id, f.slug, f.league_id, l.name league, f.kickoff_time, f.status,
           f.home_team_id, f.away_team_id,
           coalesce(th.display_name, th.canonical_name) home, coalesce(ta.display_name, ta.canonical_name) away,
           case when f.predicted_home_goals is not null and f.predicted_away_goals is not null
                 and exists (select 1 from public.model_fit_runs r where r.fit_run_id = f.prediction_fit_run_id and r.status = 'accepted')
                 and f.predicted_at < (f.kickoff_date + coalesce(f.kickoff_time, time '12:00')) at time zone 'Europe/London'
                then private.social_result_probs(f.predicted_home_goals::numeric, f.predicted_away_goals::numeric) end model,
           exists (select 1 from public.team_ratings tr where tr.fit_run_id = f.prediction_fit_run_id
                     and tr.team_id in (f.home_team_id, f.away_team_id) and tr.is_estimated) estimated,
           (select jsonb_build_object('home', round(k.market_home, 4), 'draw', round(k.market_draw, 4), 'away', round(k.market_away, 4))
              from public.fixture_market_latest k where k.fixture_id = f.fixture_id) market,
           (select jsonb_agg(distinct coalesce(b.broadcaster, b.channel, b.streaming_service))
              from public.fixture_broadcasts b
             where b.fixture_id = f.fixture_id and b.market = 'GB' and b.status = 'confirmed_broadcast'
               and coalesce(b.broadcaster, b.channel, b.streaming_service) is not null) tv,
           exists (select 1 from public.fixture_broadcasts b where b.fixture_id = f.fixture_id and b.market = 'GB'
                     and b.status = 'confirmed_not_televised') not_tv,
           coalesce(m.full_time_home_goals, f.reported_home_goals) hg, coalesce(m.full_time_away_goals, f.reported_away_goals) ag,
           m.full_time_home_goals is not null confirmed
      from public.fixtures f
      join public.leagues l on l.league_id = f.league_id
      join public.teams th on th.team_id = f.home_team_id
      join public.teams ta on ta.team_id = f.away_team_id
      left join public.matches m on m.league_id = f.league_id and m.season_id = f.season_id
                                and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
     where f.kickoff_date = p_day),
  slots as (
    select distinct ff.kickoff_time slot
      from public.fpl_fixtures ff
     where ff.season_id = public.fpl_current_season_id()
       and (ff.kickoff_time at time zone 'Europe/London')::date = p_day)
  select jsonb_build_object(
    'day', p_day,
    'games', (select coalesce(jsonb_agg(jsonb_build_object(
                 'fixture_id', g.fixture_id, 'slug', g.slug, 'league_id', g.league_id, 'league', g.league,
                 'time', to_char(g.kickoff_time, 'HH24:MI'), 'status', g.status,
                 'home_id', g.home_team_id, 'away_id', g.away_team_id, 'home', g.home, 'away', g.away,
                 'model', g.model, 'estimated', g.estimated, 'market', g.market,
                 'tv', g.tv, 'not_tv', g.not_tv, 'hg', g.hg, 'ag', g.ag, 'confirmed', g.confirmed)
               order by g.kickoff_time nulls last, g.league_id, g.home), '[]'::jsonb) from g),
    'ahead', (select coalesce(jsonb_agg(jsonb_build_object('date', a.kickoff_date, 'league_id', a.league_id, 'league', a.league, 'games', a.n)
                order by a.kickoff_date, a.league_id), '[]'::jsonb)
                from (select f.kickoff_date, f.league_id, l.name league, count(*) n
                        from public.fixtures f join public.leagues l on l.league_id = f.league_id
                       where f.kickoff_date between p_day + 1 and p_day + 7 and f.status <> 'postponed'
                       group by 1, 2, 3) a),
    'team_news', (select coalesce(jsonb_agg(jsonb_build_object('slot', s.slot,
                    'facts', private.social_team_news_facts(public.fpl_current_season_id(), s.slot, false)) order by s.slot), '[]'::jsonb)
                    from slots s)
  );
$function$
;

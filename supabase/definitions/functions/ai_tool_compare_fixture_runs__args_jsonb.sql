-- Live definition exported from the database (function ai_tool_compare_fixture_runs(args jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_tool_compare_fixture_runs(args jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
with s as (select public.fpl_current_season_id() cur),
g0 as (
  select coalesce((args->>'from_gameweek')::int,
                  (select public.ai_next_fpl_gameweek(s.cur) from s)) g0
),
r as (select g0, least(coalesce((args->>'to_gameweek')::int, g0 + 3), g0 + 9) g1 from g0),
asked as (
  select x name, public.ai_resolve_team(x) j
    from jsonb_array_elements_text(case when jsonb_typeof(args->'teams') = 'array' then args->'teams' else '[]'::jsonb end) x
),
bad as (select jsonb_agg(j) errs from asked where j ? 'error'),
want as (select array_agg((j->>'team_id')::bigint) ids from asked where not j ? 'error'),
side as (
  select ft.canonical_team_id team_id, ff.fpl_event_id gw, ff.team_h_difficulty fdr,
         f.market_home_goals mkt_for, f.market_away_goals mkt_against, f.predicted_home_goals dc_for, f.predicted_away_goals dc_against
    from fpl_fixtures ff join s on ff.season_id = s.cur join r on ff.fpl_event_id between r.g0 and r.g1
    join fpl_teams ft on ft.fpl_team_id = ff.fpl_home_team_id and ft.season_id = s.cur
    left join fixtures f on f.fixture_id = ff.canonical_fixture_id
  union all
  select ft.canonical_team_id, ff.fpl_event_id, ff.team_a_difficulty,
         f.market_away_goals, f.market_home_goals, f.predicted_away_goals, f.predicted_home_goals
    from fpl_fixtures ff join s on ff.season_id = s.cur join r on ff.fpl_event_id between r.g0 and r.g1
    join fpl_teams ft on ft.fpl_team_id = ff.fpl_away_team_id and ft.season_id = s.cur
    left join fixtures f on f.fixture_id = ff.canonical_fixture_id
),
agg as (
  select t.display_name team, count(*) fixtures,
         round(avg(fdr), 2) avg_fdr,
         round(avg(mkt_for)::numeric, 2) avg_market_goals_for, round(avg(mkt_against)::numeric, 2) avg_market_goals_against,
         round(avg(dc_for)::numeric, 2) avg_dc_goals_for, round(avg(dc_against)::numeric, 2) avg_dc_goals_against,
         count(*) - count(mkt_for) fixtures_without_market, count(*) - count(dc_for) fixtures_without_dc
    from side join teams t using (team_id), want
   where want.ids is null or side.team_id = any(want.ids)
   group by t.display_name
),
ranked as (
  select a.*,
         rank() over (order by avg_fdr) fdr_rank_easiest,
         rank() over (order by avg_market_goals_for desc nulls last) market_attack_rank,
         rank() over (order by avg_dc_goals_for desc nulls last) dc_attack_rank,
         rank() over (order by avg_market_goals_against nulls last) market_defence_rank,
         rank() over (order by avg_dc_goals_against nulls last) dc_defence_rank
    from agg a
),
lead as (
  select
    (select jsonb_agg(team order by team) from ranked where avg_fdr = (select min(avg_fdr) from ranked)) easiest_fdr,
    (select jsonb_agg(team order by team) from ranked where avg_fdr = (select max(avg_fdr) from ranked)) hardest_fdr,
    (select jsonb_agg(team order by team) from ranked where avg_market_goals_for = (select max(avg_market_goals_for) from ranked)) best_attack_market,
    (select jsonb_agg(team order by team) from ranked where avg_dc_goals_for = (select max(avg_dc_goals_for) from ranked)) best_attack_dc,
    (select jsonb_agg(team order by team) from ranked where avg_market_goals_for = (select min(avg_market_goals_for) from ranked)) weakest_attack_market,
    (select jsonb_agg(team order by team) from ranked where avg_dc_goals_for = (select min(avg_dc_goals_for) from ranked)) weakest_attack_dc,
    (select jsonb_agg(team order by team) from ranked where avg_market_goals_against = (select min(avg_market_goals_against) from ranked)) best_defence_market,
    (select jsonb_agg(team order by team) from ranked where avg_dc_goals_against = (select min(avg_dc_goals_against) from ranked)) best_defence_dc
)
select case when (select errs from bad) is not null then
  jsonb_build_object('error', 'Could not identify every team. Use find_entity and pass exact names.', 'details', (select errs from bad))
else jsonb_build_object('tool', 'compare_fixture_runs',
  'source', jsonb_build_array('fpl_fixtures', 'fixtures', 'fpl_teams', 'teams'), 'as_of', now(), 'kind', 'mixed',
  'gameweeks', (select 'GW' || g0 || '-GW' || g1 from r),
  'note', 'Averages per fixture over the gameweeks shown (double gameweeks count each fixture). avg_fdr is FPL''s fixture difficulty rating (observed; 1 easiest, 5 hardest). Goals are FixtureShark model estimates: market = bookmaker-implied, dc = Dixon-Coles. Ranks: 1 = easiest FDR, most goals for, fewest goals against. The leaders object is computed from these rows; use it for any "best", "easiest" or "hardest" claim.',
  'leaders', (select to_jsonb(lead) || jsonb_build_object('models_agree_on_best_attack', lead.best_attack_market = lead.best_attack_dc) from lead),
  'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.market_attack_rank, x.team) from ranked x), '[]'::jsonb))
end
$function$
;

-- Live definition exported from the database (function ai_tool_compare_fpl_players(args jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_tool_compare_fpl_players(args jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
with p as (
  select public.fpl_current_season_id() cur, least(greatest(coalesce((args->>'gameweeks')::int, 1), 1), 6) n_gw
),
g as (
  select coalesce((args->>'gameweek')::int,
                  (select public.ai_next_fpl_gameweek(p.cur) from p)) gw
),
asked as (
  select x name, public.ai_resolve_fpl_player(x, (select cur from p)) j
    from jsonb_array_elements_text(case when jsonb_typeof(args->'players') = 'array' then args->'players' else '[]'::jsonb end) x
),
bad as (select jsonb_agg(j) errs from asked where j ? 'error'),
ids as (select distinct (j->>'fpl_player_id')::int id from asked where not j ? 'error'),
proj as (
  select v.fpl_player_id id, sum(v.expected_fpl_points) xp, sum(v.expected_minutes) xmins, avg(v.start_probability) start,
         sum(v.expected_goals) xg, sum(v.expected_assists) xa, avg(v.clean_sheet_probability) cs, count(*) fixtures
    from fpl_projection_frontend_feed_v6 v join fixtures f on f.fixture_id = v.fixture_id, p, g
   where f.league_id = 1 and f.season_id = p.cur and f.matchweek between g.gw and g.gw + p.n_gw - 1
     and v.fpl_player_id in (select id from ids)
   group by v.fpl_player_id
),
cmp as (
  select pl.web_name player, tm.display_name team, public.ai_fpl_position(pl.element_type) position,
         round(pl.now_cost / 10.0, 1) price, pl.status fpl_status, pl.chance_of_playing_next_round, pl.news,
         coalesce(pr.fixtures, 0) fixtures,
         round(coalesce(pr.xp, 0), 2) expected_points, round(coalesce(pr.xmins, 0)) expected_minutes,
         round(pr.start, 2) avg_start_probability, round(coalesce(pr.xg, 0), 2) expected_goals,
         round(coalesce(pr.xa, 0), 2) expected_assists, round(pr.cs, 2) avg_clean_sheet_probability,
         pl.total_points season_points, pl.minutes season_minutes, pl.goals_scored season_goals, pl.assists season_assists,
         pl.selected_by_percent
    from ids join fpl_players pl on pl.fpl_player_id = ids.id and pl.season_id = (select cur from p)
    left join proj pr on pr.id = ids.id
    left join teams tm on tm.team_id = pl.canonical_team_id
),
lead as (
  select
    (select jsonb_agg(player order by player) from cmp where expected_points = (select max(expected_points) from cmp)) highest_expected_points,
    (select jsonb_agg(player order by player) from cmp where avg_start_probability = (select max(avg_start_probability) from cmp)) highest_start_probability,
    (select jsonb_agg(player order by player) from cmp where expected_minutes = (select max(expected_minutes) from cmp)) most_expected_minutes,
    (select jsonb_agg(player order by player) from cmp where expected_goals = (select max(expected_goals) from cmp)) highest_expected_goals,
    (select jsonb_agg(player order by player) from cmp where expected_assists = (select max(expected_assists) from cmp)) highest_expected_assists,
    (select jsonb_agg(player order by player) from cmp where season_points = (select max(season_points) from cmp)) most_season_points,
    (select jsonb_agg(player order by player) from cmp where price = (select min(price) from cmp)) cheapest
)
select case
  when (select errs from bad) is not null then
    jsonb_build_object('error', 'Could not identify every player. Use find_entity and pass exact names.', 'details', (select errs from bad))
  when (select count(*) from ids) < 2 or (select count(*) from ids) > 6 then
    jsonb_build_object('error', 'Pass between 2 and 6 different players.')
  else jsonb_build_object('tool', 'compare_fpl_players',
    'source', jsonb_build_array('fpl_projection_frontend_feed_v6', 'fixtures', 'fpl_players', 'teams'), 'as_of', now(), 'kind', 'mixed',
    'gameweeks', (select case when p.n_gw = 1 then 'GW' || g.gw else 'GW' || g.gw || '-GW' || (g.gw + p.n_gw - 1) end from p, g),
    'note', 'Projected figures (expected_*, avg_*) are FixtureShark model estimates summed or averaged over the gameweeks shown; season_* figures and status are observed FPL data. The leaders object is computed from these rows (ties list every player); use it for any "highest", "best" or "most" claim.',
    'leaders', (select to_jsonb(lead) from lead),
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.expected_points desc, x.player) from cmp x), '[]'::jsonb))
end
$function$
;

-- Live definition exported from the database (function ai_tool_best_fpl_combination(args jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_tool_best_fpl_combination(args jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
with p as (
  select public.fpl_current_season_id() cur,
         greatest(2, least(coalesce((args->>'count')::int, 2), 3)) k,
         round((args->>'max_total_price')::numeric * 10) budget,
         case upper(args->>'position') when 'GK' then 1 when 'DEF' then 2 when 'MID' then 3 when 'FWD' then 4 end pos,
         least(greatest(coalesce((args->>'gameweeks')::int, 1), 1), 6) n_gw
),
g as (
  select coalesce((args->>'gameweek')::int,
                  (select public.ai_next_fpl_gameweek(p.cur) from p)) gw
),
pts as (
  select pl.fpl_player_id id, pl.web_name player, tm.display_name team, public.ai_fpl_position(pl.element_type) position,
         -- rounded per player first, so the totals shown equal the sum of the figures shown
         pl.now_cost cost, round(pl.now_cost / 10.0, 1) price, round(sum(v.expected_fpl_points), 2) xp
    from fpl_projection_frontend_feed_v6 v
    join fixtures f on f.fixture_id = v.fixture_id
    join p on true join g on true
    join fpl_players pl on pl.fpl_player_id = v.fpl_player_id and pl.season_id = p.cur
    left join teams tm on tm.team_id = pl.canonical_team_id
   where f.league_id = 1 and f.season_id = p.cur and f.matchweek between g.gw and g.gw + p.n_gw - 1
     and (p.pos is null or pl.element_type = p.pos) and pl.now_cost <= p.budget
   group by pl.fpl_player_id, pl.web_name, tm.display_name, pl.element_type, pl.now_cost
),
cand as (
  select a.* from pts a, p
   where (select count(*) from pts b where b.id <> a.id and b.cost <= a.cost and (b.xp > a.xp or (b.xp = a.xp and b.id < a.id))) < p.k + 2
),
combos as (
  select jsonb_build_array(a.player, b.player) players, jsonb_build_array(to_jsonb(a) - 'id' - 'cost', to_jsonb(b) - 'id' - 'cost') detail,
         a.cost + b.cost cost, a.xp + b.xp xp
    from cand a join cand b on a.id < b.id, p
   where p.k = 2 and a.cost + b.cost <= p.budget
  union all
  select jsonb_build_array(a.player, b.player, c.player), jsonb_build_array(to_jsonb(a) - 'id' - 'cost', to_jsonb(b) - 'id' - 'cost', to_jsonb(c) - 'id' - 'cost'),
         a.cost + b.cost + c.cost, a.xp + b.xp + c.xp
    from cand a join cand b on a.id < b.id join cand c on b.id < c.id, p
   where p.k = 3 and a.cost + b.cost + c.cost <= p.budget
),
top as (select row_number() over (order by xp desc, cost) rank, * from combos order by xp desc, cost limit 3)
select case
  when (args->>'max_total_price') is null then jsonb_build_object('error', 'max_total_price (in £m) is required.')
  when (args ? 'position') and (select pos from p) is null then jsonb_build_object('error', 'position must be GK, DEF, MID or FWD.')
  else jsonb_build_object('tool', 'best_fpl_combination',
    'source', jsonb_build_array('fpl_projection_frontend_feed_v6', 'fixtures', 'fpl_players'), 'as_of', now(), 'kind', 'model_estimate',
    'gameweeks', (select case when p.n_gw = 1 then 'GW' || g.gw else 'GW' || g.gw || '-GW' || (g.gw + p.n_gw - 1) end from p, g),
    'note', 'Every combination of ' || (select k from p) || ' players within £' || (select to_char(budget / 10.0, 'FM990.0') from p) || 'm was checked (exact search). Rank 1 is the best by summed FixtureShark projected points (model estimates); ranks 2-3 are the runners-up; equal totals are ordered by lower price. Prices are current FPL prices in £m. Use these totals rather than adding players up yourself.',
    'players_considered', (select count(*) from pts),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', rank, 'players', players, 'total_price', round(cost / 10.0, 1),
                       'total_expected_points', xp, 'detail',
                       (select jsonb_agg((d - 'xp') || jsonb_build_object('expected_points', (d->>'xp')::numeric)) from jsonb_array_elements(detail) d))
                       order by rank) from top), '[]'::jsonb))
end
$function$
;

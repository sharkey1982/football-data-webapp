-- Week by week for a set-and-forget XI: the eleven you could have picked in
-- August and never touched, scored across that season's gameweeks. No captain
-- and no substitutes -- that is the exercise. players_returning and blanks
-- show how many of the eleven actually featured, which is what makes a bad
-- week bad.
--
-- Reads fpl_player_gameweek_history, which now covers 2021/22 onward; a
-- season whose XI has not been solved into season_best_xi returns no rows,
-- and the page says so rather than drawing an empty chart.
create or replace function public.get_season_xi_weekly(p_season_id bigint)
returns table(gameweek integer, total_points integer, players_returning integer, blanks integer)
language sql stable set search_path to 'public','pg_temp'
as $$
  select h.gameweek::integer,
         sum(h.total_points)::integer,
         count(*) filter (where h.minutes > 0)::integer,
         count(*) filter (where h.minutes = 0)::integer
  from public.season_best_xi x
  join public.fpl_player_gameweek_history h
    on h.season_id = x.season_id and h.fpl_code = x.fpl_code
  where x.season_id = p_season_id
  group by h.gameweek
  order by h.gameweek;
$$;
comment on function public.get_season_xi_weekly(bigint) is
  'Weekly points for a season''s set-and-forget XI: eleven players, no captain, no subs.';
grant execute on function public.get_season_xi_weekly(bigint) to anon, authenticated;

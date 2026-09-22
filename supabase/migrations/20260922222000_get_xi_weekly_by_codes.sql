-- Week by week for ANY set-and-forget XI, given its players.
--
-- Replaces get_season_xi_weekly, which read season_best_xi and so could only
-- answer for completed seasons. The season in progress has no stored XI (it
-- is solved on read, because the answer changes every gameweek) and its
-- weekly rows live in fpl_player_gameweeks rather than the imported history
-- -- which is why 2026/27 showed nothing.
--
-- Taking the eleven as codes covers both: the caller passes whichever XI it
-- is displaying, and this unions the two sources. A past season has no live
-- rows and the current season has no history rows, so nothing double-counts.
create or replace function public.get_xi_weekly_by_codes(p_season_id bigint, p_codes bigint[])
returns table(gameweek integer, total_points integer, players_returning integer, blanks integer)
language sql stable set search_path to 'public','pg_temp'
as $$
  with weekly as (
    select h.gameweek, h.total_points, h.minutes
    from public.fpl_player_gameweek_history h
    where h.season_id = p_season_id and h.fpl_code = any(p_codes)
    union all
    select g.fpl_event_id as gameweek, g.total_points, g.minutes
    from public.fpl_player_gameweeks g
    join public.fpl_players p
      on p.fpl_player_id = g.fpl_player_id and p.season_id = g.season_id
    where g.season_id = p_season_id and p.fpl_code = any(p_codes)
  )
  select gameweek::integer, sum(total_points)::integer,
         count(*) filter (where minutes > 0)::integer,
         count(*) filter (where minutes = 0)::integer
  from weekly group by gameweek order by gameweek;
$$;
comment on function public.get_xi_weekly_by_codes(bigint, bigint[]) is
  'Weekly points for a set-and-forget XI given its player codes. Covers completed seasons (imported history) and the season in progress (live gameweeks).';
grant execute on function public.get_xi_weekly_by_codes(bigint, bigint[]) to anon, authenticated;
drop function if exists public.get_season_xi_weekly(bigint);

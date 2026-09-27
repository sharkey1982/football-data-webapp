-- ============================================================================
-- Record Book RPCs: top-N streaks per kind and top-N matches per record for
-- one league, one round trip each (docs/methodology/history.md). rank() gives
-- tied entries the same rank; row_number() caps the list at p_limit.
-- ============================================================================

create or replace function public.history_record_streaks(p_league_id bigint, p_limit int default 10)
returns table (
  streak_type text, rank int, team_id bigint, length int, start_date date, end_date date,
  start_season_id bigint, end_season_id bigint, ongoing boolean, truncated_start boolean
)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  select x.streak_type, x.rk::int, x.team_id, x.length, x.start_date, x.end_date,
    x.start_season_id, x.end_season_id, x.ongoing, x.truncated_start
  from (
    select h.*,
      rank() over (partition by h.streak_type order by h.length desc) as rk,
      row_number() over (partition by h.streak_type order by h.length desc, h.start_date) as rn
    from public.history_streaks h
    where h.league_id = p_league_id
  ) x
  where x.rn <= least(greatest(p_limit, 1), 100)
  order by x.streak_type, x.rn;
$function$;

create or replace function public.history_record_matches(p_league_id bigint, p_limit int default 10)
returns table (
  record text, rank int, match_id bigint, season_id bigint, start_year int, match_date date,
  home_team_id bigint, away_team_id bigint, home_goals int, away_goals int
)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  (
    select 'biggest_win'::text, (rank() over (order by m.margin desc))::int,
      m.match_id, m.season_id, m.start_year, m.match_date, m.home_team_id, m.away_team_id, m.home_goals, m.away_goals
    from public.history_league_matches m
    where m.league_id = p_league_id
    order by m.margin desc, m.total_goals desc, m.match_date
    limit least(greatest(p_limit, 1), 100)
  )
  union all
  (
    select 'highest_scoring'::text, (rank() over (order by m.total_goals desc))::int,
      m.match_id, m.season_id, m.start_year, m.match_date, m.home_team_id, m.away_team_id, m.home_goals, m.away_goals
    from public.history_league_matches m
    where m.league_id = p_league_id
    order by m.total_goals desc, m.margin desc, m.match_date
    limit least(greatest(p_limit, 1), 100)
  );
$function$;

grant execute on function public.history_record_streaks(bigint, int) to anon, authenticated;
grant execute on function public.history_record_matches(bigint, int) to anon, authenticated;

select public.meta_refresh_flow();

update public.meta_flow_nodes set
  layer = 'model', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'Record Book: the top p_limit (max 100) runs of each kind (won, unbeaten, winless, lost, scored, clean_sheet, no_goal) in one league from history_streaks, with rank (ties share it), club, length, dates, seasons, ongoing and truncated_start. Read-only, security invoker, granted to anon.',
  refresh_note = 'Reads history_streaks; no state of its own.',
  purpose_reviewed_at = now()
where node_key = 'function:history_record_streaks(p_league_id bigint, p_limit integer)';

update public.meta_flow_nodes set
  layer = 'model', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'Record Book: the top p_limit (max 100) league matches in one league by winning margin (biggest_win, then total goals) and by total goals (highest_scoring, then margin), with rank (ties share it), season, date, teams and score. Read-only, security invoker, granted to anon.',
  refresh_note = 'Reads history_league_matches; no state of its own.',
  purpose_reviewed_at = now()
where node_key = 'function:history_record_matches(p_league_id bigint, p_limit integer)';

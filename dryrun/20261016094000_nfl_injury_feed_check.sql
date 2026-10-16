-- ============================================================================
-- NFL: injury-feed health and result lag (16 Oct 2026).
--
-- "injury report rows 0" in recent nfl_projections runs was legitimate, not a
-- missing feed: the summary counted only the GAME status (Out/Questionable),
-- which teams publish on Friday (Thursday for the Thursday game). The
-- nflverse file had week 6 practice reports for 354 players on 16 Oct and the
-- projections stored them (practice_status). The script now reports practice
-- and game-status rows separately and warns when the feed can't be read.
--
-- New checks in check_nfl_integrity:
-- * nfl_injury_feed (warning): from Thursday to Sunday, the next week's
--   projections should carry practice or game statuses for some players;
--   none means the feed is missing or not being read.
-- * nfl_results_lag (warning): games kicked off more than 36 hours ago with
--   no score (the daily import runs once a day and GitHub can start it hours
--   late; nfl_results_fresh still fails at 2 days).
-- ============================================================================

do $$
declare d text; a text := 'coalesce((select max(d.as_of) from nfl.depth_daily d), date ''2000-01-01'') < current_date - 3) x';
begin
  d := pg_get_functiondef('public.check_nfl_integrity()'::regprocedure);
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'check_nfl_integrity anchor not found exactly once'; end if;
  d := replace(d, a, a || '
  union all
  select ''nfl_injury_feed'',
    case when n_games = 0 or extract(isodow from current_date) between 1 and 3 or n_status > 0 then ''ok'' else ''warning'' end,
    n_status,
    ''Projected players with a practice or game status for the next NFL week (nflverse injuries; teams publish practice reports from Wednesday): '' || n_status || '' of '' || n_rows
  from (select count(*) filter (where p.practice_status is not null or p.injury_status is not null) n_status,
               count(*) n_rows, count(distinct p.game_id) n_games
        from nfl.projections p join nfl.games g on g.game_id = p.game_id
        where g.kickoff_at between now() and now() + interval ''5 days'' and g.home_score is null) x
  union all
  select ''nfl_results_lag'', case when n = 0 then ''ok'' else ''warning'' end, n,
    ''NFL games kicked off more than 36 hours ago still without a score: '' || coalesce(ids, ''none'')
  from (select count(*) n, string_agg(g.game_id, '', '' order by g.kickoff_at) ids from nfl.games g
        where g.game_type is not null and g.home_score is null
          and g.kickoff_at between now() - interval ''14 days'' and now() - interval ''36 hours'') x');
  execute d;
end $$;

do $$
begin
  if (select count(*) from public.check_nfl_integrity() where check_name in ('nfl_injury_feed', 'nfl_results_lag')) <> 2 then
    raise exception 'new NFL checks missing';
  end if;
end $$;

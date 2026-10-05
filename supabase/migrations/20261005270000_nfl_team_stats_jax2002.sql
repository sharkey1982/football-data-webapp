-- ============================================================================
-- NFL team stats integrity: exempt a known gap in the source. nflverse
-- stats_team_week 2002 has no Jacksonville rows for its eight home games
-- (only the visitors' rows), so nfl_team_stats_fresh found 8 games after the
-- backfill on 5 Oct 2026. Nothing to fix on our side; every other scored game
-- 2002-2026 has both teams. Same function as 20261005260000 otherwise.
-- ============================================================================

create or replace function public.check_nfl_integrity()
returns table(check_name text, status text, found bigint, detail text)
language sql stable security definer set search_path = '' as $$
  select 'nfl_results_fresh', case when n = 0 then 'ok' else 'failed' end, n,
    'NFL games kicked off more than 2 days ago still without a score'
  from (select count(*) n from nfl.games where kickoff_at < now() - interval '2 days' and home_score is null) x
  union all
  select 'nfl_standings_complete', case when n = 0 then 'ok' else 'failed' end, n,
    'Complete NFL seasons whose standings do not have 32 teams each with the full regular-season schedule'
  from (select count(*) n from (
          select s.season from public.nfl_standings s where s.season_complete
          group by s.season
          having count(*) <> 32
              or count(*) filter (where s.played + case when s.season = 2022 and s.franchise in ('BUF', 'CIN') then 1 else 0 end
                                    <> case when s.season >= 2021 then 17 else 16 end) > 0) y) x
  union all
  select 'nfl_games_mapped', case when n = 0 then 'ok' else 'failed' end, n,
    'NFL games missing from public.nfl_games (unmapped team code)'
  from (select (select count(*) from nfl.games) - (select count(*) from public.nfl_games) n) x
  union all
  select 'nfl_division_winners', case when n = 0 then 'ok' else 'failed' end, n,
    'Completed NFL division-seasons without exactly one division winner from the play-off bracket'
  from (select count(*) n from (
          select s.season, s.conference, s.division from public.nfl_standings s where s.season_complete
          group by 1, 2, 3 having count(*) filter (where s.won_division) <> 1) y) x
  union all
  select 'nfl_fantasy_points_match', case when n = 0 then 'ok' else 'failed' end, n,
    'NFL player-weeks (non-kickers) where our standard or PPR points differ from nflverse by more than 0.01'
  from (select count(*) n from nfl.player_weeks w
        where w.position <> 'K' and w.src_points_std is not null
          and w.fg_att = 0 and w.pat_made = 0 and w.pat_missed = 0
          and (abs(nfl.points_std(w) - w.src_points_std) > 0.011
               or abs(nfl.points_std(w) + w.receptions - w.src_points_ppr) > 0.011)) x
  union all
  select 'nfl_player_stats_fresh', case when n = 0 then 'ok' else 'failed' end, n,
    'Scored NFL games (2016+) older than 3 days with no player stats'
  from (select count(*) n from nfl.games g
        where g.season >= 2016 and g.home_score is not null and g.kickoff_at < now() - interval '3 days'
          and not exists (select 1 from nfl.player_weeks w where w.game_id = g.game_id)) x
  union all
  select 'nfl_model_fresh', case when n = 0 then 'ok' else 'failed' end, n,
    'NFL games kicking off in the next 48 hours without a model prediction from the last 36 hours'
  from (select count(*) n from nfl.games g
        where g.kickoff_at between now() and now() + interval '48 hours'
          and not exists (select 1 from nfl.model_predictions p
                          where p.game_id = g.game_id and p.predicted_at > now() - interval '36 hours')) x
  union all
  select 'nfl_team_stats_fresh', case when n = 0 then 'ok' else 'failed' end, n,
    'Scored NFL games (2002+) older than 3 days without team stats for both teams'
  from (select count(*) n from nfl.games g
        where g.home_score is not null and g.kickoff_at < now() - interval '3 days'
          and (select count(*) from nfl.team_weeks t where t.game_id = g.game_id) <> 2
          -- Known source gap: nflverse stats_team_week has no Jacksonville rows
          -- for its eight 2002 home games (checked 5 Oct 2026); the visitors' rows exist.
          and not (g.season = 2002 and g.home_code = 'JAX')) x
$$;
revoke all on function public.check_nfl_integrity() from public, anon, authenticated;
grant execute on function public.check_nfl_integrity() to service_role;

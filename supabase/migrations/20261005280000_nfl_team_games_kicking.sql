-- ============================================================================
-- NFL match-up stat lines (Chris, 5 Oct 2026: passing and rushing yards,
-- touchdowns, kicks, and the actuals). Adds kicking to public.nfl_team_games:
-- field goals made / attempted and PATs for the team, and field goals the
-- opponent made. New columns go at the end, so the view is replaced in place
-- and public.nfl_team_seasons (which reads it) is unaffected.
-- ============================================================================

create or replace view public.nfl_team_games with (security_invoker = true) as
select t.season, t.week, t.season_type, t.game_id, tc.franchise, oc.franchise as opponent,
  case when hc.franchise = tc.franchise then g.home_score else g.away_score end as points_for,
  case when hc.franchise = tc.franchise then g.away_score else g.home_score end as points_against,
  t.attempts + t.sacks_suffered + t.carries as plays,
  t.attempts, t.carries, t.completions,
  t.passing_yards - t.sack_yards_lost as pass_yards_net, t.rushing_yards,
  t.passing_tds, t.rushing_tds, t.passing_interceptions + t.fumbles_lost as giveaways,
  t.sacks_suffered, t.passing_first_downs + t.rushing_first_downs as first_downs,
  t.passing_epa, t.rushing_epa, t.penalties, t.penalty_yards,
  t.def_sacks, t.def_interceptions + t.fumble_recovery_opp as takeaways,
  t.def_tds + t.special_teams_tds as def_st_tds,
  o.attempts + o.sacks_suffered + o.carries as opp_plays,
  o.attempts as opp_attempts, o.carries as opp_carries,
  o.passing_yards - o.sack_yards_lost as opp_pass_yards_net, o.rushing_yards as opp_rushing_yards,
  o.passing_tds as opp_passing_tds, o.rushing_tds as opp_rushing_tds,
  nfl.dst_points(t.def_sacks, t.def_interceptions, t.fumble_recovery_opp, t.def_safeties, t.def_blocks,
    t.def_tds + t.special_teams_tds,
    case when hc.franchise = tc.franchise then g.away_score else g.home_score end) as dst_points,
  -- Added 5 Oct 2026 (match-up stat lines): kicking for the team and allowed.
  t.fg_made, t.fg_att, t.pat_made, o.fg_made as opp_fg_made
from nfl.team_weeks t
join nfl.team_codes tc on tc.code = t.team
join nfl.team_codes oc on oc.code = t.opponent
join nfl.games g on g.game_id = t.game_id
join nfl.team_codes hc on hc.code = g.home_code
left join nfl.team_weeks o on o.game_id = t.game_id and o.team = t.opponent;

grant select on public.nfl_team_games to anon, authenticated, service_role;

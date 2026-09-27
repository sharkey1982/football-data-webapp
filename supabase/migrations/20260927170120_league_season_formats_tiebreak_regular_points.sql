-- ============================================================================
-- LEAGUE SEASON FORMATS: Poland and Romania break ties on regular-season
-- points.
--
-- Checked against the official tables after 20260927170110: head-to-head
-- over the whole season put Steaua (FCSB) above Viitorul in Romania 2016/17
-- (Viitorul were champions on the same 44 points) and swapped five other
-- Polish and Romanian pairs. Wikipedia's classification rules for these
-- leagues' championship / relegation rounds are points, (unrounded points,)
-- points in the regular season, then head-to-head in the regular season:
--   regular_points  regular-season points, then points, goal difference
--                   and goals in the regular-season games between the clubs
--                   still level
-- ============================================================================

alter table public.league_season_formats
  drop constraint league_season_formats_tiebreak_check,
  add constraint league_season_formats_tiebreak_check
    check (tiebreak in ('goal_difference', 'head_to_head', 'regular_position', 'regular_points'));

update public.league_season_formats f
set tiebreak = 'regular_points'
from public.leagues l
where l.league_id = f.league_id and f.format = 'split' and l.code in ('POL', 'ROU');

comment on column public.league_season_formats.tiebreak is 'After (unrounded) points: head_to_head (games between the tied clubs, whole season), regular_position (regular-season finish), regular_points (regular-season points, then head-to-head in the regular season) or goal_difference; then goal difference and goals scored.';

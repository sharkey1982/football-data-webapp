-- ============================================================================
-- LEAGUE SEASON FORMATS: the tie-break after (unrounded) points.
--
-- Checked against the official tables, clubs level on points after the split
-- are separated by each league's own rule:
--   head_to_head      points, then goal difference, then goals in the games
--                     between the tied clubs (Austria, Greece, Poland,
--                     Romania; Wikipedia's "Rules for classification")
--   regular_position  regular-season finishing position (Belgium: points,
--                     points without the rounded-up half point, regular
--                     season position)
--   goal_difference   goal difference, then goals scored, over the season
--                     (Scotland, Switzerland, Denmark, Finland; also what
--                     league_standings does for every other season)
-- league_standings then falls back to goal difference and goals scored.
-- ============================================================================

alter table public.league_season_formats
  add column tiebreak text check (tiebreak in ('goal_difference', 'head_to_head', 'regular_position'));

update public.league_season_formats f
set tiebreak = case l.code
    when 'AUT' then 'head_to_head'
    when 'G1'  then 'head_to_head'
    when 'POL' then 'head_to_head'
    when 'ROU' then 'head_to_head'
    when 'B1'  then 'regular_position'
    else 'goal_difference' end
from public.leagues l
where l.league_id = f.league_id and f.format = 'split';

alter table public.league_season_formats
  drop constraint league_season_formats_split_fields,
  add constraint league_season_formats_split_fields check (
    case when format = 'split'
      then regular_meetings is not null and group_sizes is not null and group_games is not null
           and tiebreak is not null and cardinality(group_sizes) = cardinality(group_games)
      else regular_meetings is null and halved_groups is null and group_sizes is null and group_games is null
           and tiebreak is null
    end);

comment on column public.league_season_formats.tiebreak is 'After (unrounded) points: head_to_head (games between the tied clubs), regular_position (regular-season finish) or goal_difference; then goal difference and goals scored.';

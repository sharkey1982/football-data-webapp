-- ============================================================================
-- ai_tool_get_league_table: show the split-format columns.
--
-- league_standings now halves points and locks groups for split formats
-- (league_season_formats). Without split_group and split_adjustment the
-- assistant would see e.g. Club Brugge 2023/24 on 50 points from a 30-game
-- record worth more, or a 7th-placed club with more points than the 6th, and
-- could explain it wrongly. Anchored edits of the live definition; each
-- anchor must match exactly once.
-- ============================================================================

do $do$
declare
  def text := pg_get_functiondef('public.ai_tool_get_league_table(jsonb)'::regprocedure);
  a1 text := $a$jsonb_build_array('league_standings', 'point_deductions')$a$;
  a2 text := $a$'note', 'points already include any deduction (shown in deduction). Sorted by position.'$a$;
  a3 text := $a$s.deduction, s.points,$a$;
begin
  if (length(def) - length(replace(def, a1, ''))) / length(a1) <> 1 then raise exception 'anchor 1 not unique'; end if;
  if (length(def) - length(replace(def, a2, ''))) / length(a2) <> 1 then raise exception 'anchor 2 not unique'; end if;
  if (length(def) - length(replace(def, a3, ''))) / length(a3) <> 1 then raise exception 'anchor 3 not unique'; end if;
  def := replace(def, a1, $r$jsonb_build_array('league_standings', 'point_deductions', 'league_season_formats')$r$);
  def := replace(def, a2, $r$'note', 'points already include any deduction (shown in deduction) and, in split formats, any halving of regular-season points (split_adjustment, negative). split_group 1 is the championship group: after the split, groups are locked, so a club in group 1 ranks above every club in group 2 whatever the points. European play-off ties are not in the table. Sorted by position.'$r$);
  def := replace(def, a3, $r$s.deduction, s.split_adjustment, s.split_group, s.points,$r$);
  execute def;
end $do$;

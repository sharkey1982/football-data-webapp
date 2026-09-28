-- ============================================================================
-- FPL scoring engine (Model Lab P1): rules by season, fpl_score(), and a
-- regression of the engine against every FPL points total we hold.
--
-- fpl_scoring_rules held 2026/27 only. This adds 2021/22 to 2025/26 in the
-- same table (same rule codes), from the published rules:
--   2021/22-2024/25  no defensive contribution; goalkeeper goal 6.
--   2025/26          defensive contribution added (DEF 10 CBIT, MID/FWD
--                    12 CBIRT, 2 points, capped); goalkeeper goal still 6.
--   2026/27          as already loaded (goalkeeper goal 10).
-- No goalkeeper scored in any season held, so the goalkeeper-goal value is
-- the one rule the data does not test; its notes say so.
--
-- fpl_score(): points for one player in one match from the raw stats,
-- driven entirely by the season's rows in fpl_scoring_rules (pivoted by
-- fpl_scoring_rule_sets; the arithmetic is fpl_score_calc, which the
-- regression calls directly so it runs in about a second, not ten). Bonus is an
-- input (it is decided by BPS rank across the match, not by the player's
-- own stats). Mirrored in scripts/fpl_scoring.py.
--
-- fpl_scoring_regression: the engine against FPL's own totals.
--   2026/27      per player per match, every stat observed: must match exactly.
--   2021/22-24/25 per player-season: the per-match history has no own goals,
--                penalties or defensive contributions, so match scores are
--                summed and the season's own-goal and penalty totals added.
--                Must match exactly.
--   2025/26      as above, but defensive contributions are not in the history
--                either: what is left must be a non-negative multiple of 2.
-- At build (28 Sep 2026): 0 mismatches in every season.
--
-- Readers of fpl_scoring_rules must now filter by season (the site's
-- getFplScoringRules does, from the same release).
-- ============================================================================

-- Rules for 2021/22-2025/26: the 2026/27 rows with the season differences.
with src as (
  select r.rule_code, r.player_position, r.points, r.threshold, r.notes, s.season_id, s.start_year
  from public.fpl_scoring_rules r
  cross join (select season_id, start_year from public.seasons where season_id between 8 and 12) s
  where r.season_id = 13
    and not (r.rule_code = 'defensive_contribution' and s.start_year < 2025)
    and not exists (select 1 from public.fpl_scoring_rules x where x.season_id = s.season_id)
)
insert into public.fpl_scoring_rules (season_id, rule_code, player_position, points, threshold, notes, source_name, updated_at)
select src.season_id, src.rule_code, src.player_position,
  case when src.rule_code = 'goal' and src.player_position = 'GK' then 6 else src.points end,
  src.threshold,
  case when src.rule_code = 'goal' and src.player_position = 'GK'
       then 'Goal scored (no goalkeeper goal in the data, so not tested by the regression)'
       else src.notes end,
  'official_fpl', now()
from src
order by src.season_id, src.rule_code, src.player_position;

update public.fpl_scoring_rules set notes = 'Goal scored (no goalkeeper goal in the data, so not tested by the regression)'
where season_id = 13 and rule_code = 'goal' and player_position = 'GK';

-- One row of rule values per season and position (GK/DEF/MID/FWD), so the
-- arithmetic below needs no lookup per call.
create or replace view public.fpl_scoring_rule_sets with (security_invoker = true) as
select r.season_id, pos.element_type, pos.code as position,
  max(r.points)    filter (where r.rule_code = 'appearance_under_60')    as appearance_pts,
  max(r.threshold) filter (where r.rule_code = 'appearance_under_60')    as appearance_min,
  max(r.points)    filter (where r.rule_code = 'appearance_60_plus')     as full_pts,
  max(r.threshold) filter (where r.rule_code = 'appearance_60_plus')     as full_min,
  max(r.points)    filter (where r.rule_code = 'goal')                   as goal_pts,
  max(r.points)    filter (where r.rule_code = 'assist')                 as assist_pts,
  max(r.points)    filter (where r.rule_code = 'clean_sheet')            as clean_sheet_pts,
  max(r.threshold) filter (where r.rule_code = 'clean_sheet')            as clean_sheet_min,
  max(r.points)    filter (where r.rule_code = 'save')                   as save_pts,
  max(r.threshold) filter (where r.rule_code = 'save')                   as saves_per,
  max(r.points)    filter (where r.rule_code = 'goals_conceded')         as conceded_pts,
  max(r.threshold) filter (where r.rule_code = 'goals_conceded')         as conceded_per,
  max(r.points)    filter (where r.rule_code = 'penalty_save')           as penalty_save_pts,
  max(r.points)    filter (where r.rule_code = 'penalty_miss')           as penalty_miss_pts,
  max(r.points)    filter (where r.rule_code = 'own_goal')               as own_goal_pts,
  max(r.points)    filter (where r.rule_code = 'yellow_card')            as yellow_pts,
  max(r.points)    filter (where r.rule_code = 'red_card')               as red_pts,
  max(r.points)    filter (where r.rule_code = 'defensive_contribution') as defcon_pts,
  max(r.threshold) filter (where r.rule_code = 'defensive_contribution') as defcon_min
from public.fpl_scoring_rules r
join (values (1, 'GK'), (2, 'DEF'), (3, 'MID'), (4, 'FWD')) as pos(element_type, code)
  on r.player_position is null or r.player_position = pos.code
group by r.season_id, pos.element_type, pos.code;

-- The arithmetic: pure, inlined by the planner. A rule the season does not
-- have (e.g. defensive contribution before 2025/26) scores nothing.
create or replace function public.fpl_score_calc(
  rs public.fpl_scoring_rule_sets, p_minutes int,
  p_goals int, p_assists int, p_clean_sheets int, p_goals_conceded int, p_saves int,
  p_penalties_saved int, p_penalties_missed int, p_own_goals int,
  p_yellow_cards int, p_red_cards int, p_bonus int, p_defensive_contribution int
) returns int
language sql immutable
as $$
  select (
      case when p_minutes >= rs.full_min then rs.full_pts
           when p_minutes >= rs.appearance_min then rs.appearance_pts else 0 end
    + p_goals * coalesce(rs.goal_pts, 0)
    + p_assists * coalesce(rs.assist_pts, 0)
    + case when p_clean_sheets > 0 and p_minutes >= rs.clean_sheet_min then rs.clean_sheet_pts else 0 end
    + coalesce(floor(p_saves / rs.saves_per) * rs.save_pts, 0)
    + coalesce(floor(p_goals_conceded / rs.conceded_per) * rs.conceded_pts, 0)
    + p_penalties_saved * coalesce(rs.penalty_save_pts, 0)
    + p_penalties_missed * coalesce(rs.penalty_miss_pts, 0)
    + p_own_goals * coalesce(rs.own_goal_pts, 0)
    + p_yellow_cards * coalesce(rs.yellow_pts, 0)
    + p_red_cards * coalesce(rs.red_pts, 0)
    + case when coalesce(p_defensive_contribution, 0) >= rs.defcon_min then rs.defcon_pts else 0 end
  )::int + coalesce(p_bonus, 0)
$$;

-- The entry point: season and position in, points out. Null when the
-- season has no rules.
create or replace function public.fpl_score(
  p_season_id bigint, p_element_type int, p_minutes int,
  p_goals int, p_assists int, p_clean_sheets int, p_goals_conceded int, p_saves int,
  p_penalties_saved int, p_penalties_missed int, p_own_goals int,
  p_yellow_cards int, p_red_cards int, p_bonus int, p_defensive_contribution int default 0
) returns int
language sql stable
set search_path = public
as $$
  select public.fpl_score_calc(rs, p_minutes, p_goals, p_assists, p_clean_sheets, p_goals_conceded, p_saves,
    p_penalties_saved, p_penalties_missed, p_own_goals, p_yellow_cards, p_red_cards, p_bonus, p_defensive_contribution)
  from public.fpl_scoring_rule_sets rs
  where rs.season_id = p_season_id and rs.element_type = p_element_type
$$;

comment on function public.fpl_score is 'FPL points for one player in one match from raw stats, using that season''s rows in fpl_scoring_rules (via fpl_scoring_rule_sets and fpl_score_calc). Bonus is an input. Null when the season has no rules. Mirrored in scripts/fpl_scoring.py; verified by fpl_scoring_regression.';

create or replace view public.fpl_scoring_regression with (security_invoker = true) as
with gw as (   -- every stat observed: exact per match
  select w.season_id, w.total_points,
    public.fpl_score_calc(rs, w.minutes,
      (s->>'goals_scored')::int, (s->>'assists')::int, (s->>'clean_sheets')::int, (s->>'goals_conceded')::int,
      (s->>'saves')::int, (s->>'penalties_saved')::int, (s->>'penalties_missed')::int, (s->>'own_goals')::int,
      (s->>'yellow_cards')::int, (s->>'red_cards')::int, (s->>'bonus')::int,
      coalesce((s->>'defensive_contribution')::int, 0)) as calc
  from public.fpl_player_gameweeks w
  cross join lateral (select w.source_payload->'stats' as s) x
  join public.fpl_players p on p.fpl_player_id = w.fpl_player_id and p.season_id = w.season_id
  left join public.fpl_scoring_rule_sets rs on rs.season_id = w.season_id and rs.element_type = p.element_type
  where w.source_payload ? 'stats'
), hist as (   -- per player-season, adding the season's own goals and penalties
  select h.season_id, h.fpl_code,
    sum(h.total_points) as actual,
    sum(public.fpl_score_calc(rs, h.minutes, h.goals_scored, h.assists, h.clean_sheets,
      h.goals_conceded, h.saves, 0, 0, 0, h.yellow_cards, h.red_cards, h.bonus, 0))
      + coalesce(max(t.own_goals) * max(rs.own_goal_pts), 0)
      + coalesce(max(t.penalties_missed) * max(rs.penalty_miss_pts), 0)
      + coalesce(max(t.penalties_saved) * max(rs.penalty_save_pts), 0) as calc,   -- penalty saves are a GK rule only
    bool_or(rs.defcon_pts is not null) as defcon_unobserved
  from public.fpl_player_gameweek_history h
  join public.fpl_player_season_totals t using (season_id, fpl_code)
  left join public.fpl_scoring_rule_sets rs on rs.season_id = h.season_id and rs.element_type = t.element_type
  group by h.season_id, h.fpl_code
)
select s.season_id, s.start_year, 'match' as level, count(*)::int as rows_tested,
  count(*) filter (where gw.calc is distinct from gw.total_points)::int as mismatches,
  'Every stat observed; engine must equal FPL''s total for every player in every match.' as note
from gw join public.seasons s using (season_id) group by s.season_id, s.start_year
union all
select s.season_id, s.start_year, 'player_season', count(*)::int,
  count(*) filter (where case when hist.defcon_unobserved
                              then hist.calc is null or (hist.actual - hist.calc) < 0 or (hist.actual - hist.calc) % 2 <> 0
                              else hist.calc is distinct from hist.actual end)::int,
  case when bool_or(hist.defcon_unobserved)
       then 'Own goals and penalties from season totals; defensive contributions are not in the history, so the remainder must be a non-negative multiple of 2.'
       else 'Own goals and penalties from season totals; engine must equal FPL''s season total for every player.' end
from hist join public.seasons s using (season_id) group by s.season_id, s.start_year;

revoke all on public.fpl_scoring_regression from anon, authenticated;
grant select on public.fpl_scoring_regression to service_role;
-- The rules are public reference data (the scoring rules page shows them).
grant select on public.fpl_scoring_rule_sets to anon, authenticated, service_role;

-- Integrity: the engine must reproduce FPL's points.
do $$
declare
  def text := pg_get_functiondef('public.check_model_integrity'::regproc);
  anchor text := '  -- Catalogue (2026-09-26)';
  addition text := $add$  -- FPL scoring engine (2026-09-28): fpl_score() must reproduce FPL's own
  -- points for every season held (fpl_scoring_regression).
  select 'fpl_scoring_regression',
    case when coalesce(sum(mismatches), 0) = 0 then 'ok' else 'failed' end,
    coalesce(sum(mismatches), 0),
    'Rows where fpl_score() disagrees with FPL''s points (fpl_scoring_regression; rules in fpl_scoring_rules)'
  from public.fpl_scoring_regression
  union all
$add$;
begin
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'check_model_integrity anchor not found exactly once';
  end if;
  execute replace(def, anchor, addition || anchor);
end $$;

select public.meta_refresh_flow();

update public.meta_flow_nodes set layer = 'fantasy', status = 'current', is_public = false, ai_relevant = true,
  purpose = 'FPL points for one player in one match from raw stats (minutes, goals, assists, clean sheet, goals conceded, saves, penalties, own goals, cards, bonus, defensive contribution), using that season''s rows in fpl_scoring_rules. The single scoring engine for expected-points work; mirrored in scripts/fpl_scoring.py.',
  refresh_note = 'Function; reads fpl_scoring_rules.', purpose_reviewed_at = now()
where node_key like 'function:fpl_score(%';

update public.meta_flow_nodes set layer = 'fantasy', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Regression of fpl_score() against FPL''s own points: per match for 2026/27 (every stat observed), per player-season for 2021/22-2025/26 (own goals and penalties from season totals; 2025/26 defensive contributions unobserved, so the remainder must be a non-negative multiple of 2). Checked by check_model_integrity (fpl_scoring_regression).',
  refresh_note = 'View over fpl_player_gameweeks, fpl_player_gameweek_history and fpl_player_season_totals.', purpose_reviewed_at = now()
where node_key = 'object:fpl_scoring_regression';

update public.meta_flow_nodes set layer = 'fantasy', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'FPL scoring rules pivoted to one row per season and position (GK/DEF/MID/FWD): points and thresholds for appearance, goal, assist, clean sheet, saves, goals conceded, penalties, own goal, cards and defensive contribution. Input to fpl_score_calc.',
  refresh_note = 'View over fpl_scoring_rules.', purpose_reviewed_at = now()
where node_key = 'object:fpl_scoring_rule_sets';

update public.meta_flow_nodes set layer = 'fantasy', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'The FPL points arithmetic: one season-and-position rule set (fpl_scoring_rule_sets) and one player''s match stats in, points out. Pure, so the planner inlines it; fpl_score() and fpl_scoring_regression both call it.',
  refresh_note = 'Function.', purpose_reviewed_at = now()
where node_key like 'function:fpl_score_calc(%';

update public.meta_flow_nodes set purpose_reviewed_at = now()
where node_key in ('object:fpl_scoring_rules', 'function:check_model_integrity()');

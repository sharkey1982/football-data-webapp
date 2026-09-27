-- ============================================================================
-- Historical analytics, Phase A (What Happened Next?, Historic Pace, table
-- reliability). Builds on team_match_snapshot / team_season_summary
-- (docs/methodology/history.md).
--
-- 1. comparable_group becomes clubs x double-round-robin games (e.g. 20x38)
--    instead of clubs x games played so far, so the CURRENT season joins the
--    same group as the finished ones it is compared with.
-- 2. league_pace_benchmarks: points percentiles after N matches for final,
--    complete, non-split seasons, by outcome group.
-- 3. league_table_reliability: after N matches, how far the table still is
--    from the final one (rank correlation, mean absolute position change).
-- 4. history_what_happened_next(): comparable team-seasons after N matches,
--    optionally by position and points range, with how each finished.
-- ============================================================================

drop materialized view public.league_season_summary;
drop materialized view public.team_season_summary;

create materialized view public.team_season_summary as
with ls as (
  select l.*, s.start_year from public.league_standings l join public.seasons s on s.season_id = l.season_id
  join public.leagues lg on lg.league_id = l.league_id and lg.competition_type = 'league'
),
next_season as (
  select s.season_id, n.season_id as next_season_id
  from public.seasons s join public.seasons n on n.start_year = s.start_year + 1
),
games as (
  select league_id, season_id, max(played) as games_in_season, count(*) as clubs
  from ls group by league_id, season_id
)
select ls.league_id, ls.league_code, ls.league_name, ls.season_id, ls.season_label, ls.start_year,
  ls.team_id, ls.position, ls.teams, ls.is_final, ls.curtailed, ls.ranked_on,
  ls.played, ls.won, ls.drawn, ls.lost, ls.goals_for, ls.goals_against, ls.goals_for - ls.goals_against as goal_difference,
  ls.clean_sheets, ls.failed_to_score, ls.points_won, ls.deduction, ls.points, ls.ppg,
  ls.home_played, ls.home_won, ls.home_drawn, ls.home_lost, ls.home_points, ls.home_goals_for, ls.home_goals_against,
  ls.away_played, ls.away_won, ls.away_drawn, ls.away_lost, ls.away_points, ls.away_goals_for, ls.away_goals_against,
  ls.split_group,
  g.games_in_season, g.clubs,
  -- Double round robin size: the same for a finished season and the current one.
  g.clubs || 'x' || (2 * (g.clubs - 1)) as comparable_group,
  exists (select 1 from public.league_season_formats f where f.league_id = ls.league_id and f.season_id = ls.season_id and f.format = 'split') as split_format,
  (ls.is_final and ls.position = 1) as champion,
  case when ls.is_final then ls.position <= 4 end as top_four,
  case when ls.is_final then ls.position <= 6 end as top_six,
  nxt.league_id as next_league_id,
  case
    when not ls.is_final or not nx.next_known then null
    when ls.league_id between 1 and 5 and nxt.league_id is null then case when ls.league_id = 5 then true end
    when ls.league_id between 1 and 5 then nxt.league_id > ls.league_id
    else nxt.league_id is null
  end as relegated,
  case
    when not ls.is_final or not nx.next_known then null
    when ls.league_id between 1 and 5 then nxt.league_id < ls.league_id
    else false
  end as promoted
from ls
join games g on g.league_id = ls.league_id and g.season_id = ls.season_id
left join next_season ns on ns.season_id = ls.season_id
left join lateral (
  select exists (select 1 from ls l2 where l2.season_id = ns.next_season_id
                 and (l2.league_id = ls.league_id or (ls.league_id between 1 and 5 and l2.league_id between 1 and 5))) as next_known
) nx on true
left join lateral (
  select l3.league_id from ls l3
  where l3.season_id = ns.next_season_id and l3.team_id = ls.team_id
    and (l3.league_id = ls.league_id or (ls.league_id between 1 and 5 and l3.league_id between 1 and 5))
  limit 1
) nxt on true;

create unique index team_season_summary_pk on public.team_season_summary (league_id, season_id, team_id);
create index team_season_summary_team on public.team_season_summary (team_id);
create index team_season_summary_group on public.team_season_summary (league_id, comparable_group);

create materialized view public.league_season_summary as
with m as (
  select m.league_id, m.season_id, m.full_time_home_goals hg, m.full_time_away_goals ag,
    m.half_time_home_goals is not null as has_ht, m.home_shots is not null as has_stats
  from public.matches m join public.leagues l on l.league_id = m.league_id and l.competition_type = 'league'
  where m.full_time_home_goals is not null and m.full_time_away_goals is not null
),
mm as (
  select league_id, season_id, count(*) as matches,
    avg(hg + ag) as goals_per_game,
    avg(hg) as home_goals_per_game, avg(ag) as away_goals_per_game,
    avg((hg > ag)::int) as home_win_share, avg((hg = ag)::int) as draw_share, avg((hg < ag)::int) as away_win_share,
    avg((hg = 0 and ag = 0)::int) as goalless_share,
    (avg((ag = 0)::int) + avg((hg = 0)::int)) / 2 as clean_sheet_share,
    avg(abs(hg - ag)) filter (where hg <> ag) as avg_winning_margin,
    avg(case when hg > ag then 3 when hg = ag then 1 else 0 end) - avg(case when ag > hg then 3 when hg = ag then 1 else 0 end) as home_ppg_advantage,
    avg(has_ht::int) as half_time_coverage, avg(has_stats::int) as stats_coverage
  from m group by league_id, season_id
),
t as (
  select league_id, season_id,
    max(league_code) as league_code, max(season_label) as season_label, max(start_year) as start_year,
    max(clubs) as clubs, max(games_in_season) as games_in_season, max(comparable_group) as comparable_group,
    bool_and(is_final) as is_final, bool_or(curtailed) as curtailed, bool_or(split_format) as split_format,
    max(points) filter (where champion) as champion_points,
    max(ppg) filter (where champion) as champion_ppg,
    max(points) filter (where relegated) as highest_relegated_points,
    min(points) filter (where relegated = false) as lowest_safe_points,
    stddev_samp(ppg) as ppg_sd,
    stddev_samp((won + 0.5 * drawn)::numeric / nullif(played, 0)) / (0.5 / sqrt(max(games_in_season))) as noll_scully,
    max(points) - min(points) as points_spread
  from public.team_season_summary group by league_id, season_id
)
select t.*, mm.matches, mm.goals_per_game, mm.home_goals_per_game, mm.away_goals_per_game,
  mm.home_win_share, mm.draw_share, mm.away_win_share, mm.goalless_share, mm.clean_sheet_share,
  mm.avg_winning_margin, mm.home_ppg_advantage, mm.half_time_coverage, mm.stats_coverage,
  (t.start_year in (2019, 2020)) as covid_affected
from t join mm on mm.league_id = t.league_id and mm.season_id = t.season_id;

create unique index league_season_summary_pk on public.league_season_summary (league_id, season_id);

-- Points after N matches by final outcome, for complete finished seasons.
create materialized view public.league_pace_benchmarks as
with base as (
  select s.league_id, t.comparable_group, s.matches_played, s.points,
    t.champion, t.top_four, t.top_six, t.relegated
  from public.team_match_snapshot s
  join public.team_season_summary t using (league_id, season_id, team_id)
  where t.is_final and not t.curtailed and not t.split_format
),
grouped as (
  select league_id, comparable_group, matches_played, 'all'::text as outcome, points from base
  union all select league_id, comparable_group, matches_played, 'champion', points from base where champion
  union all select league_id, comparable_group, matches_played, 'top_four', points from base where top_four
  union all select league_id, comparable_group, matches_played, 'top_six', points from base where top_six
  union all select league_id, comparable_group, matches_played, 'relegated', points from base where relegated
)
select league_id, comparable_group, matches_played, outcome, count(*) as team_seasons,
  percentile_cont(0.10) within group (order by points) as p10,
  percentile_cont(0.25) within group (order by points) as p25,
  percentile_cont(0.50) within group (order by points) as p50,
  percentile_cont(0.75) within group (order by points) as p75,
  percentile_cont(0.90) within group (order by points) as p90,
  min(points) as min_points, max(points) as max_points, avg(points) as mean_points
from grouped
group by league_id, comparable_group, matches_played, outcome;

create unique index league_pace_benchmarks_pk on public.league_pace_benchmarks (league_id, comparable_group, matches_played, outcome);

-- How settled the table is after N matches (complete finished seasons).
create materialized view public.league_table_reliability as
with base as (
  select s.league_id, t.comparable_group, s.season_id, s.matches_played,
    s.position_at_played, t.position as final_position
  from public.team_match_snapshot s
  join public.team_season_summary t using (league_id, season_id, team_id)
  where t.is_final and not t.curtailed and not t.split_format
),
per_season as (
  select league_id, comparable_group, season_id, matches_played,
    corr(position_at_played, final_position) as rank_corr,
    avg(abs(position_at_played - final_position)) as mean_abs_change,
    avg((position_at_played = final_position)::int) as same_position_share
  from base group by league_id, comparable_group, season_id, matches_played
  having count(*) >= 4
)
select league_id, comparable_group, matches_played, count(*) as seasons,
  avg(rank_corr) as rank_correlation, avg(mean_abs_change) as mean_abs_position_change,
  avg(same_position_share) as same_position_share
from per_season
group by league_id, comparable_group, matches_played;

create unique index league_table_reliability_pk on public.league_table_reliability (league_id, comparable_group, matches_played);

grant select on public.team_season_summary, public.league_season_summary,
  public.league_pace_benchmarks, public.league_table_reliability to anon, authenticated;

-- What Happened Next? ------------------------------------------------------------
create or replace function public.history_what_happened_next(
  p_league_id bigint,
  p_matches_played int,
  p_position_min int default null,
  p_position_max int default null,
  p_points_min int default null,
  p_points_max int default null,
  p_from_year int default null,
  p_to_year int default null,
  p_comparable_group text default null
)
returns table (
  season_id bigint, season_label text, start_year int, team_id bigint, team_name text, team_slug text,
  position_at_played int, teams_at_played int, points int, goal_difference int,
  final_position int, final_points int, clubs bigint,
  champion boolean, top_four boolean, top_six boolean, relegated boolean, promoted boolean
)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  select s.season_id, t.season_label, t.start_year, s.team_id, tm.display_name, tm.slug,
    s.position_at_played, s.teams_at_played, s.points, s.goal_difference,
    t.position, t.points, t.clubs,
    t.champion, t.top_four, t.top_six, t.relegated, t.promoted
  from public.team_match_snapshot s
  join public.team_season_summary t using (league_id, season_id, team_id)
  join public.teams tm on tm.team_id = s.team_id
  where s.league_id = p_league_id
    and s.matches_played = p_matches_played
    and t.is_final and not t.curtailed and not t.split_format
    and (p_comparable_group is null or t.comparable_group = p_comparable_group)
    and (p_position_min is null or s.position_at_played >= p_position_min)
    and (p_position_max is null or s.position_at_played <= p_position_max)
    and (p_points_min is null or s.points >= p_points_min)
    and (p_points_max is null or s.points <= p_points_max)
    and (p_from_year is null or t.start_year >= p_from_year)
    and (p_to_year is null or t.start_year <= p_to_year)
  order by t.start_year desc, s.position_at_played, tm.display_name
  limit 2000;
$function$;

grant execute on function public.history_what_happened_next(bigint, int, int, int, int, int, int, int, text) to anon, authenticated;

-- Refresh the new views with the rest of the layer.
create or replace function public.refresh_history_derived(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_seasons int := 0;
  v_rows bigint := 0;
  v_started timestamptz := clock_timestamp();
begin
  for r in
    select m.league_id, m.season_id
    from public.matches m join public.leagues l on l.league_id = m.league_id and l.competition_type = 'league'
    where m.full_time_home_goals is not null
    group by m.league_id, m.season_id
    having p_force
        or count(*) * 2 <> coalesce((select count(*) from public.team_match_snapshot s
                                     where s.league_id = m.league_id and s.season_id = m.season_id), 0)
        or max(m.updated_at) > coalesce((select min(s.refreshed_at) from public.team_match_snapshot s
                                         where s.league_id = m.league_id and s.season_id = m.season_id), '-infinity')
        or exists (select 1 from public.point_deductions d where d.league_id = m.league_id and d.season_id = m.season_id
                   and d.created_at > coalesce((select min(s.refreshed_at) from public.team_match_snapshot s
                                                where s.league_id = m.league_id and s.season_id = m.season_id), '-infinity'))
  loop
    v_rows := v_rows + public.refresh_team_match_snapshot(r.league_id, r.season_id);
    v_seasons := v_seasons + 1;
  end loop;

  refresh materialized view concurrently public.team_season_summary;
  refresh materialized view concurrently public.league_season_summary;
  refresh materialized view concurrently public.league_pace_benchmarks;
  refresh materialized view concurrently public.league_table_reliability;

  return jsonb_build_object('league_seasons_rebuilt', v_seasons, 'snapshot_rows', v_rows,
    'seconds', round(extract(epoch from clock_timestamp() - v_started)::numeric, 1));
end;
$function$;

-- Guard the public views' grants the way the other public views are guarded.
do $$
declare
  v_def text;
  v_anchor text := '''model_scorecard_matches''';
begin
  select pg_get_functiondef('public.check_model_integrity'::regproc) into v_def;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'check_model_integrity public-views anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor, v_anchor || ', ''team_season_summary'', ''league_season_summary'', ''league_pace_benchmarks'', ''league_table_reliability''');
end $$;

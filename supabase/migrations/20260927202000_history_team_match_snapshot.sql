-- ============================================================================
-- Historical analytics data layer, step A0 (Historical Analytics & Data Lab
-- design, sections 3-4).
--
-- team_match_snapshot: one row per team per league match, in date order,
-- with the cumulative record after that match, the team's position in the
-- real table on that date and its position among all teams' records after the
-- same number of matches. It is the single source for What Happened Next?,
-- Historic Pace, trajectories, the Ghost Table, table reliability and
-- streaks, and replaces the timelapse's in-browser calculation.
--
-- Rules (documented in docs/methodology/history.md):
--  * League competitions only (leagues.competition_type = 'league').
--  * Points after deductions: a deduction counts from its effective_date;
--    an undated one (or one dated after the team's last match) counts from the
--    team's latest row, so the latest row always equals league_standings.
--  * Order: points, then goal difference, then goals scored; goals scored
--    before goal difference in EFL tiers 2-4 up to 1998/99, as
--    league_standings does. Ties share a rank.
--  * Split-format seasons: raw totals over every game (no halving, no
--    groups); their official table is in league_standings.
--
-- team_season_summary / league_season_summary: materialised season-level
-- summaries (sections 3-4), refreshed with the snapshot.
-- ============================================================================

create table public.team_match_snapshot (
  league_id bigint not null,
  season_id bigint not null,
  team_id bigint not null,
  matches_played int not null,
  match_id bigint not null,
  match_date date not null,
  venue text not null check (venue in ('H', 'A')),
  opponent_team_id bigint not null,
  goals_for int not null,
  goals_against int not null,
  result text not null check (result in ('W', 'D', 'L')),
  won int not null,
  drawn int not null,
  lost int not null,
  cum_goals_for int not null,
  cum_goals_against int not null,
  goal_difference int not null,
  points_won int not null,
  deduction int not null,
  points int not null,
  position_on_date int not null,
  teams_in_league int not null,
  position_at_played int not null,
  teams_at_played int not null,
  refreshed_at timestamptz not null default now(),
  primary key (league_id, season_id, team_id, matches_played)
);
create index team_match_snapshot_played on public.team_match_snapshot (league_id, matches_played);
create index team_match_snapshot_team on public.team_match_snapshot (team_id, season_id);
create index team_match_snapshot_date on public.team_match_snapshot (league_id, season_id, match_date);

alter table public.team_match_snapshot enable row level security;
create policy "Public read access" on public.team_match_snapshot for select to anon, authenticated using (true);
grant select on public.team_match_snapshot to anon, authenticated;

create or replace function public.refresh_team_match_snapshot(p_league_id bigint, p_season_id bigint)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_goals_first boolean;
  v_rows integer;
begin
  select (p_league_id in (2, 3, 4) and s.start_year <= 1998) into v_goals_first
  from public.seasons s where s.season_id = p_season_id;

  delete from public.team_match_snapshot where league_id = p_league_id and season_id = p_season_id;

  with tm as (
    select m.match_id, m.match_date, m.home_team_id as team_id, m.away_team_id as opp, 'H'::text as venue,
           m.full_time_home_goals as gf, m.full_time_away_goals as ga
    from public.matches m
    where m.league_id = p_league_id and m.season_id = p_season_id
      and m.full_time_home_goals is not null and m.full_time_away_goals is not null
    union all
    select m.match_id, m.match_date, m.away_team_id, m.home_team_id, 'A',
           m.full_time_away_goals, m.full_time_home_goals
    from public.matches m
    where m.league_id = p_league_id and m.season_id = p_season_id
      and m.full_time_home_goals is not null and m.full_time_away_goals is not null
  ),
  c as (
    select tm.*,
      row_number() over w as n,
      count(*) over (partition by tm.team_id) as total_n,
      sum((tm.gf > tm.ga)::int) over w as won,
      sum((tm.gf = tm.ga)::int) over w as drawn,
      sum((tm.gf < tm.ga)::int) over w as lost,
      sum(tm.gf) over w as cgf,
      sum(tm.ga) over w as cga,
      sum(case when tm.gf > tm.ga then 3 when tm.gf = tm.ga then 1 else 0 end) over w as pts_won
    from tm
    window w as (partition by tm.team_id order by tm.match_date, tm.match_id rows unbounded preceding)
  ),
  c2 as (
    select c.*,
      coalesce((select sum(d.points) from public.point_deductions d
                where d.league_id = p_league_id and d.season_id = p_season_id and d.team_id = c.team_id
                  and (d.effective_date <= c.match_date or c.n = c.total_n)), 0)::int as ded
    from c
  ),
  c3 as (
    select c2.*, (c2.pts_won + c2.ded) as pts, (c2.cgf - c2.cga) as gd
    from c2
  ),
  teams_all as (select distinct team_id from c3),
  dates as (select distinct match_date from c3),
  -- each team's latest record on each match date of the season (0 before its
  -- first game): carry the last played row forward with a running group id.
  j as (
    select d.match_date as asof, t.team_id, x.pts, x.gd, x.cgf,
      count(x.pts) over (partition by t.team_id order by d.match_date) as grp
    from dates d cross join teams_all t
    left join c3 x on x.team_id = t.team_id and x.match_date = d.match_date
  ),
  st as (
    select asof, team_id,
      coalesce(max(pts) over (partition by team_id, grp), 0) as pts,
      coalesce(max(gd) over (partition by team_id, grp), 0) as gd,
      coalesce(max(cgf) over (partition by team_id, grp), 0) as cgf
    from j
  ),
  pos_date as (
    select asof, team_id,
      rank() over (partition by asof order by pts desc,
        case when v_goals_first then cgf else gd end desc,
        case when v_goals_first then gd else cgf end desc) as pos,
      count(*) over (partition by asof) as teams
    from st
  ),
  pos_played as (
    select team_id, n,
      rank() over (partition by n order by pts desc,
        case when v_goals_first then cgf else gd end desc,
        case when v_goals_first then gd else cgf end desc) as pos,
      count(*) over (partition by n) as teams
    from c3
  )
  insert into public.team_match_snapshot (
    league_id, season_id, team_id, matches_played, match_id, match_date, venue, opponent_team_id,
    goals_for, goals_against, result, won, drawn, lost, cum_goals_for, cum_goals_against, goal_difference,
    points_won, deduction, points, position_on_date, teams_in_league, position_at_played, teams_at_played)
  select p_league_id, p_season_id, c3.team_id, c3.n, c3.match_id, c3.match_date, c3.venue, c3.opp,
    c3.gf, c3.ga, case when c3.gf > c3.ga then 'W' when c3.gf = c3.ga then 'D' else 'L' end,
    c3.won, c3.drawn, c3.lost, c3.cgf, c3.cga, c3.gd,
    c3.pts_won, c3.ded, c3.pts, pd.pos, pd.teams, pp.pos, pp.teams
  from c3
  join pos_date pd on pd.asof = c3.match_date and pd.team_id = c3.team_id
  join pos_played pp on pp.team_id = c3.team_id and pp.n = c3.n;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$;

revoke all on function public.refresh_team_match_snapshot(bigint, bigint) from public, anon, authenticated;
grant execute on function public.refresh_team_match_snapshot(bigint, bigint) to service_role;

-- Season summaries ------------------------------------------------------------

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
  g.games_in_season, g.clubs, g.clubs || 'x' || g.games_in_season as comparable_group,
  (ls.is_final and ls.position = 1) as champion,
  case when ls.is_final then ls.position <= 4 end as top_four,
  case when ls.is_final then ls.position <= 6 end as top_six,
  nxt.league_id as next_league_id,
  -- English pyramid (league_id 1-5 = tiers 1-5): movement is read from where
  -- the club plays next season. A tier 1-4 club absent from the data next
  -- season (dropped below the loaded National League seasons, expelled, or
  -- re-formed as another team, e.g. Wimbledon 2004) is NULL, not guessed; a
  -- National League club absent next season went down. Elsewhere only top
  -- flights are loaded, so a club absent next season "left the league".
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
    bool_and(is_final) as is_final, bool_or(curtailed) as curtailed,
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
  exists (select 1 from public.league_season_formats f where f.league_id = t.league_id and f.season_id = t.season_id and f.format = 'split') as split_format,
  (t.start_year in (2019, 2020)) as covid_affected
from t join mm on mm.league_id = t.league_id and mm.season_id = t.season_id;

create unique index league_season_summary_pk on public.league_season_summary (league_id, season_id);

grant select on public.team_season_summary, public.league_season_summary to anon, authenticated;

-- Orchestration -----------------------------------------------------------------

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

  return jsonb_build_object('league_seasons_rebuilt', v_seasons, 'snapshot_rows', v_rows,
    'seconds', round(extract(epoch from clock_timestamp() - v_started)::numeric, 1));
end;
$function$;

revoke all on function public.refresh_history_derived(boolean) from public, anon, authenticated;
grant execute on function public.refresh_history_derived(boolean) to service_role;

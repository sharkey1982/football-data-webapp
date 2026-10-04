-- ============================================================================
-- NFL players and fantasy points (4 Oct 2026).
--
-- Source: nflverse-data releases, stats_player/stats_player_week_<season>.csv
-- (weekly box-score stats) and players/players.csv (bios), loaded by
-- scripts/nfl_import.py for QB, RB, FB, WR, TE and K from 2016.
--
-- Fantasy points are computed HERE, in three formats (standard, half-PPR,
-- PPR), and checked daily against nflverse's own standard and PPR points
-- (check_nfl_integrity: nfl_fantasy_points_match). Before shipping: 0
-- mismatches on 22,829 player-weeks (2025-26). Kickers use the common ESPN
-- standard rules, which nflverse does not score.
-- ============================================================================

create table nfl.players (
  player_id text primary key,              -- nflverse gsis_id, e.g. '00-0033873'
  slug text not null unique,               -- URL segment; never changed once set
  name text not null,
  position text,
  position_group text,
  latest_team text,                        -- nflverse code (may be a pre-move code)
  birth_date date,
  height_in int,
  weight_lb int,
  college text,
  rookie_season int,
  draft_year int,
  draft_round int,
  draft_pick int,
  draft_team text,
  jersey_number int,
  status text,
  years_exp int,
  imported_at timestamptz not null default now()
);

create table nfl.player_weeks (
  player_id text not null references nfl.players(player_id),
  game_id text not null references nfl.games(game_id),
  season int not null,
  week int not null,
  season_type text not null check (season_type in ('REG', 'POST')),
  team text not null references nfl.team_codes(code),
  opponent text not null references nfl.team_codes(code),
  position text not null,
  completions int not null default 0,
  attempts int not null default 0,
  passing_yards int not null default 0,
  passing_tds int not null default 0,
  interceptions int not null default 0,
  sacks int not null default 0,
  passing_2pt int not null default 0,
  carries int not null default 0,
  rushing_yards int not null default 0,
  rushing_tds int not null default 0,
  rushing_2pt int not null default 0,
  receptions int not null default 0,
  targets int not null default 0,
  receiving_yards int not null default 0,
  receiving_tds int not null default 0,
  receiving_2pt int not null default 0,
  fumbles_lost int not null default 0,     -- rushing + receiving + sack fumbles lost
  special_teams_tds int not null default 0,
  target_share numeric,
  air_yards_share numeric,
  wopr numeric,
  fg_made_0_39 int not null default 0,
  fg_made_40_49 int not null default 0,
  fg_made_50_plus int not null default 0,
  fg_att int not null default 0,
  fg_missed int not null default 0,
  pat_made int not null default 0,
  pat_missed int not null default 0,
  src_points_std numeric,                  -- nflverse fantasy_points, for the check
  src_points_ppr numeric,                  -- nflverse fantasy_points_ppr
  imported_at timestamptz not null default now(),
  primary key (player_id, game_id)
);
create index nfl_player_weeks_season_idx on nfl.player_weeks (season, week);
create index nfl_player_weeks_opp_idx on nfl.player_weeks (season, opponent);

alter table nfl.players enable row level security;
alter table nfl.player_weeks enable row level security;
create policy "public read" on nfl.players for select to anon, authenticated using (true);
create policy "public read" on nfl.player_weeks for select to anon, authenticated using (true);
grant select on nfl.players, nfl.player_weeks to anon, authenticated;
grant all on nfl.players, nfl.player_weeks to service_role;

-- ---------------------------------------------------------------------------
-- Writers (service_role only).
-- ---------------------------------------------------------------------------
create or replace function public.nfl_upsert_players(rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into nfl.players as p (player_id, slug, name, position, position_group, latest_team, birth_date,
    height_in, weight_lb, college, rookie_season, draft_year, draft_round, draft_pick, draft_team,
    jersey_number, status, years_exp, imported_at)
  select r->>'player_id', r->>'slug', r->>'name', r->>'position', r->>'position_group', r->>'latest_team',
    (r->>'birth_date')::date, (r->>'height_in')::int, (r->>'weight_lb')::int, r->>'college',
    (r->>'rookie_season')::int, (r->>'draft_year')::int, (r->>'draft_round')::int, (r->>'draft_pick')::int,
    r->>'draft_team', (r->>'jersey_number')::int, r->>'status', (r->>'years_exp')::int, now()
  from jsonb_array_elements(rows) r
  on conflict (player_id) do update set
    -- slug deliberately NOT updated: a published URL never changes.
    name = excluded.name, position = coalesce(excluded.position, p.position),
    position_group = coalesce(excluded.position_group, p.position_group),
    latest_team = coalesce(excluded.latest_team, p.latest_team), birth_date = coalesce(excluded.birth_date, p.birth_date),
    height_in = coalesce(excluded.height_in, p.height_in), weight_lb = coalesce(excluded.weight_lb, p.weight_lb),
    college = coalesce(excluded.college, p.college), rookie_season = coalesce(excluded.rookie_season, p.rookie_season),
    draft_year = coalesce(excluded.draft_year, p.draft_year), draft_round = coalesce(excluded.draft_round, p.draft_round),
    draft_pick = coalesce(excluded.draft_pick, p.draft_pick), draft_team = coalesce(excluded.draft_team, p.draft_team),
    jersey_number = coalesce(excluded.jersey_number, p.jersey_number), status = coalesce(excluded.status, p.status),
    years_exp = coalesce(excluded.years_exp, p.years_exp), imported_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.nfl_upsert_player_weeks(rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into nfl.player_weeks as w
  select (jsonb_populate_record(null::nfl.player_weeks, r || jsonb_build_object('imported_at', now()))).*
  from jsonb_array_elements(rows) r
  on conflict (player_id, game_id) do update set
    season = excluded.season, week = excluded.week, season_type = excluded.season_type,
    team = excluded.team, opponent = excluded.opponent, position = excluded.position,
    completions = excluded.completions, attempts = excluded.attempts, passing_yards = excluded.passing_yards,
    passing_tds = excluded.passing_tds, interceptions = excluded.interceptions, sacks = excluded.sacks,
    passing_2pt = excluded.passing_2pt, carries = excluded.carries, rushing_yards = excluded.rushing_yards,
    rushing_tds = excluded.rushing_tds, rushing_2pt = excluded.rushing_2pt, receptions = excluded.receptions,
    targets = excluded.targets, receiving_yards = excluded.receiving_yards, receiving_tds = excluded.receiving_tds,
    receiving_2pt = excluded.receiving_2pt, fumbles_lost = excluded.fumbles_lost,
    special_teams_tds = excluded.special_teams_tds, target_share = excluded.target_share,
    air_yards_share = excluded.air_yards_share, wopr = excluded.wopr,
    fg_made_0_39 = excluded.fg_made_0_39, fg_made_40_49 = excluded.fg_made_40_49,
    fg_made_50_plus = excluded.fg_made_50_plus, fg_att = excluded.fg_att, fg_missed = excluded.fg_missed,
    pat_made = excluded.pat_made, pat_missed = excluded.pat_missed,
    src_points_std = excluded.src_points_std, src_points_ppr = excluded.src_points_ppr, imported_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.nfl_upsert_players(jsonb) from public, anon, authenticated;
revoke all on function public.nfl_upsert_player_weeks(jsonb) from public, anon, authenticated;
grant execute on function public.nfl_upsert_players(jsonb) to service_role;
grant execute on function public.nfl_upsert_player_weeks(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Scoring. One function so every view scores the same way.
--   Standard: pass yd 0.04, pass TD 4, INT -2, rush/rec yd 0.1, rush/rec/ST TD 6,
--   2-pt conversion 2, fumble lost -2. Half-PPR +0.5 a reception, PPR +1.
--   Kicker: FG 0-39 yds 3, 40-49 4, 50+ 5, missed FG -1, PAT 1, missed PAT -1.
-- ---------------------------------------------------------------------------
create or replace function nfl.points_std(w nfl.player_weeks)
returns numeric language sql immutable set search_path = '' as $$
  select round(
      w.passing_yards * 0.04 + w.passing_tds * 4 - w.interceptions * 2
    + (w.rushing_yards + w.receiving_yards) * 0.1
    + (w.rushing_tds + w.receiving_tds + w.special_teams_tds) * 6
    + (w.passing_2pt + w.rushing_2pt + w.receiving_2pt) * 2
    - w.fumbles_lost * 2
    + w.fg_made_0_39 * 3 + w.fg_made_40_49 * 4 + w.fg_made_50_plus * 5 - w.fg_missed
    + w.pat_made - w.pat_missed, 2)
$$;
grant execute on function nfl.points_std(nfl.player_weeks) to anon, authenticated, service_role;

create view public.nfl_player_weeks with (security_invoker = true) as
select w.player_id, p.slug as player_slug, p.name as player_name, w.position,
  w.season, w.week, w.season_type, w.game_id,
  tf.franchise as team, opf.franchise as opponent, opf.slug as opponent_slug, opf.short_name as opponent_short,
  (g.home_code = w.team) as at_home, g.gameday, g.kickoff_at,
  case when g.home_code = w.team then g.home_score else g.away_score end as team_score,
  case when g.home_code = w.team then g.away_score else g.home_score end as opponent_score,
  w.completions, w.attempts, w.passing_yards, w.passing_tds, w.interceptions, w.sacks,
  w.carries, w.rushing_yards, w.rushing_tds, w.receptions, w.targets, w.receiving_yards, w.receiving_tds,
  w.fumbles_lost, w.passing_2pt + w.rushing_2pt + w.receiving_2pt as two_pt, w.special_teams_tds,
  w.target_share, w.air_yards_share, w.wopr,
  w.fg_made_0_39 + w.fg_made_40_49 + w.fg_made_50_plus as fg_made, w.fg_att, w.pat_made, w.pat_missed,
  nfl.points_std(w) as pts_std,
  nfl.points_std(w) + 0.5 * w.receptions as pts_half,
  nfl.points_std(w) + w.receptions as pts_ppr
from nfl.player_weeks w
join nfl.players p on p.player_id = w.player_id
join nfl.games g on g.game_id = w.game_id
join nfl.team_codes tc on tc.code = w.team
join nfl.franchises tf on tf.franchise = tc.franchise
join nfl.team_codes oc on oc.code = w.opponent
join nfl.franchises opf on opf.franchise = oc.franchise;

-- Regular season per player-season. team = the franchise of the latest week.
create view public.nfl_player_seasons with (security_invoker = true) as
with w as (
  select pw.*, nfl.points_std(pw) as s, tc.franchise as fr,
    row_number() over (partition by pw.player_id, pw.season order by pw.week desc) as recency
  from nfl.player_weeks pw join nfl.team_codes tc on tc.code = pw.team
  where pw.season_type = 'REG'
)
select w.player_id, p.slug as player_slug, p.name as player_name,
  (array_agg(w.position order by w.week desc))[1] as position,
  w.season,
  (array_agg(f.franchise order by w.week desc))[1] as team,
  (array_agg(f.slug order by w.week desc))[1] as team_slug,
  (array_agg(f.short_name order by w.week desc))[1] as team_short,
  count(*) as games,
  sum(w.completions) as completions, sum(w.attempts) as attempts, sum(w.passing_yards) as passing_yards,
  sum(w.passing_tds) as passing_tds, sum(w.interceptions) as interceptions,
  sum(w.carries) as carries, sum(w.rushing_yards) as rushing_yards, sum(w.rushing_tds) as rushing_tds,
  sum(w.receptions) as receptions, sum(w.targets) as targets, sum(w.receiving_yards) as receiving_yards,
  sum(w.receiving_tds) as receiving_tds, sum(w.fumbles_lost) as fumbles_lost,
  round(avg(w.target_share), 3) as target_share,
  sum(w.fg_made_0_39 + w.fg_made_40_49 + w.fg_made_50_plus) as fg_made, sum(w.fg_att) as fg_att,
  sum(w.pat_made) as pat_made,
  sum(w.s) as pts_std,
  sum(w.s + 0.5 * w.receptions) as pts_half,
  sum(w.s + w.receptions) as pts_ppr,
  round(avg(w.s), 2) as ppg_std,
  round(avg(w.s + 0.5 * w.receptions), 2) as ppg_half,
  round(avg(w.s + w.receptions), 2) as ppg_ppr,
  round(avg(w.s + w.receptions) filter (where w.recency <= 3), 2) as last3_ppg_ppr,
  round(avg(w.s) filter (where w.recency <= 3), 2) as last3_ppg_std,
  round(avg(w.s + 0.5 * w.receptions) filter (where w.recency <= 3), 2) as last3_ppg_half,
  round(stddev_pop(w.s + w.receptions)::numeric, 2) as sd_ppr,
  max(w.s + w.receptions) as best_ppr,
  max(w.week) as last_week
from w
join nfl.players p on p.player_id = w.player_id
join nfl.franchises f on f.franchise = w.fr
group by w.player_id, p.slug, p.name, w.season;

-- Fantasy points each defence has allowed to each position, per game, per
-- regular season. Rank 1 = the most allowed (the kindest matchup).
create view public.nfl_points_allowed with (security_invoker = true) as
with by_game as (
  select w.season, oc.franchise as defence, w.game_id,
    case when w.position = 'FB' then 'RB' else w.position end as position,
    sum(nfl.points_std(w)) as std, sum(nfl.points_std(w) + w.receptions) as ppr,
    sum(nfl.points_std(w) + 0.5 * w.receptions) as half
  from nfl.player_weeks w join nfl.team_codes oc on oc.code = w.opponent
  where w.season_type = 'REG'
  group by 1, 2, 3, 4
), agg as (
  select season, defence, position, count(*) as games,
    round(avg(std), 2) as std_per_game, round(avg(half), 2) as half_per_game, round(avg(ppr), 2) as ppr_per_game
  from by_game group by 1, 2, 3
)
select a.*, f.slug as defence_slug, f.name as defence_name, f.short_name as defence_short,
  rank() over (partition by a.season, a.position order by a.ppr_per_game desc) as ppr_rank
from agg a join nfl.franchises f on f.franchise = a.defence;

create view public.nfl_players with (security_invoker = true) as
select p.player_id, p.slug, p.name, p.position, p.position_group,
  f.franchise as team, f.slug as team_slug, f.name as team_name,
  p.birth_date, p.height_in, p.weight_lb, p.college, p.rookie_season,
  p.draft_year, p.draft_round, p.draft_pick, p.jersey_number, p.status, p.years_exp
from nfl.players p
left join nfl.team_codes tc on tc.code = p.latest_team
left join nfl.franchises f on f.franchise = tc.franchise;

-- One row per season: the season fingerprint behind the season stories.
create view public.nfl_season_summary with (security_invoker = true) as
select g.season,
  count(*) filter (where g.game_type = 'REG') as reg_games,
  count(*) filter (where g.game_type = 'REG' and g.home_score is not null) as reg_played,
  round(avg(g.home_score + g.away_score) filter (where g.game_type = 'REG'), 2) as points_per_game,
  round(avg(case when g.home_score > g.away_score then 1.0 when g.home_score < g.away_score then 0.0 else 0.5 end)
        filter (where g.game_type = 'REG' and not g.neutral_site), 3) as home_win_share,
  round(avg(case when abs(g.home_score - g.away_score) <= 8 then 1.0 else 0.0 end) filter (where g.game_type = 'REG'), 3) as one_score_share,
  count(*) filter (where g.game_type = 'REG' and g.overtime) as overtime_games,
  count(*) filter (where g.game_type = 'REG' and g.home_score = g.away_score) as ties,
  round(avg(case when g.spread_line > 0 and g.home_score > g.away_score then 1.0
                 when g.spread_line < 0 and g.away_score > g.home_score then 1.0
                 when g.spread_line <> 0 and g.home_score <> g.away_score then 0.0 end)
        filter (where g.game_type = 'REG'), 3) as favourite_win_share,
  count(*) filter (where g.game_type = 'REG' and g.neutral_site) as neutral_games
from nfl.games g
where g.home_score is not null
group by g.season;

grant select on public.nfl_player_weeks, public.nfl_player_seasons, public.nfl_points_allowed,
  public.nfl_players, public.nfl_season_summary to anon, authenticated, service_role;

comment on view public.nfl_player_weeks is 'NFL player-week box scores (QB/RB/FB/WR/TE/K, 2016+) with fantasy points: pts_std, pts_half, pts_ppr. Scoring: nfl.points_std.';
comment on view public.nfl_player_seasons is 'NFL regular-season totals per player-season with fantasy points per game in three formats, last-3 average and weekly spread (sd_ppr).';
comment on view public.nfl_points_allowed is 'Fantasy points each defence allowed per game to each position, regular season; ppr_rank 1 = most allowed.';

-- ---------------------------------------------------------------------------
-- Integrity: add the player checks to check_nfl_integrity().
-- ---------------------------------------------------------------------------
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
  -- Our scoring must reproduce nflverse's own standard and PPR points.
  select 'nfl_fantasy_points_match', case when n = 0 then 'ok' else 'failed' end, n,
    'NFL player-weeks (non-kickers) where our standard or PPR points differ from nflverse by more than 0.01'
  from (select count(*) n from nfl.player_weeks w
        where w.position <> 'K' and w.src_points_std is not null
          and (abs(nfl.points_std(w) - w.src_points_std) > 0.011
               or abs(nfl.points_std(w) + w.receptions - w.src_points_ppr) > 0.011)) x
  union all
  -- Player stats lag results: a scored game since 2016 older than 3 days with no player rows.
  select 'nfl_player_stats_fresh', case when n = 0 then 'ok' else 'failed' end, n,
    'Scored NFL games (2016+) older than 3 days with no player stats'
  from (select count(*) n from nfl.games g
        where g.season >= 2016 and g.home_score is not null and g.kickoff_at < now() - interval '3 days'
          and not exists (select 1 from nfl.player_weeks w where w.game_id = g.game_id)) x
$$;
revoke all on function public.check_nfl_integrity() from public, anon, authenticated;
grant execute on function public.check_nfl_integrity() to service_role;

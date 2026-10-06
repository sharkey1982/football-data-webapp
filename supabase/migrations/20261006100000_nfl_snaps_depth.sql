-- ============================================================================
-- NFL snap counts and depth charts (Chris, 6 Oct 2026: the NFL counterpart of
-- FPL's Minutes Outlook -- "will he play, and how much?").
--
-- Sources (nflverse, loaded by scripts/nfl_import.py):
--   snap_counts_<season>.csv   per player per game, every position, from 2013.
--                              Players are Pro Football Reference ids; mapped to
--                              our gsis player_id via nflverse players.csv
--                              (99.8% of fantasy-position rows in 2026).
--   depth_charts_<season>.csv  2016-2024: weekly, depth 1/2/3 per position.
--                              2025 on: ESPN daily snapshots (slot + rank); we
--                              keep the last snapshot of each day.
-- Depth charts are kept for fantasy positions only (QB RB FB WR TE K).
-- ============================================================================

create table if not exists nfl.player_snaps (
  game_id text not null,
  pfr_player_id text not null,
  player_id text,                          -- gsis id when mapped (no FK: linemen aren't in nfl.players)
  player_name text not null,
  season int not null,
  week int not null,
  game_type text not null,
  team text not null,                      -- team code (nfl.team_codes)
  opponent text not null,
  position text,
  offense_snaps int not null default 0,
  offense_pct numeric,
  defense_snaps int not null default 0,
  defense_pct numeric,
  st_snaps int not null default 0,
  st_pct numeric,
  imported_at timestamptz not null default now(),
  primary key (game_id, pfr_player_id)
);
create index if not exists nfl_player_snaps_player_idx on nfl.player_snaps (player_id, season);
create index if not exists nfl_player_snaps_season_idx on nfl.player_snaps (season, week, team);

create table if not exists nfl.depth_weekly (
  season int not null,
  week int not null,
  game_type text not null,
  team text not null,
  player_id text not null,
  player_name text,
  position text not null,                  -- QB RB FB WR TE K
  slot text not null,                      -- nflverse depth_position (e.g. LWR, RWR, SWR, RB, QB)
  depth int not null,                      -- 1 = starter
  imported_at timestamptz not null default now(),
  primary key (season, week, game_type, team, player_id, slot)
);

create table if not exists nfl.depth_daily (
  as_of date not null,                     -- the day of the snapshot (UTC)
  snapshot_at timestamptz not null,        -- the last snapshot that day
  season int not null,
  team text not null,
  player_id text not null,
  player_name text,
  position text not null,                  -- QB RB FB WR TE K (ESPN PK -> K)
  slot int not null,                       -- ESPN pos_slot (the column on the chart, e.g. WR1/WR2/WR3)
  depth int not null,                      -- ESPN pos_rank (1 = starter in that slot)
  imported_at timestamptz not null default now(),
  primary key (as_of, team, player_id, slot)
);
create index if not exists nfl_depth_daily_team_idx on nfl.depth_daily (team, as_of desc);

alter table nfl.player_snaps enable row level security;
alter table nfl.depth_weekly enable row level security;
alter table nfl.depth_daily enable row level security;
drop policy if exists "public read" on nfl.player_snaps;
drop policy if exists "public read" on nfl.depth_weekly;
drop policy if exists "public read" on nfl.depth_daily;
create policy "public read" on nfl.player_snaps for select to anon, authenticated using (true);
create policy "public read" on nfl.depth_weekly for select to anon, authenticated using (true);
create policy "public read" on nfl.depth_daily for select to anon, authenticated using (true);
grant select on nfl.player_snaps, nfl.depth_weekly, nfl.depth_daily to anon, authenticated;
grant all on nfl.player_snaps, nfl.depth_weekly, nfl.depth_daily to service_role;

-- ---------------------------------------------------------------------------
-- Writers (service_role only).
-- ---------------------------------------------------------------------------
create or replace function public.nfl_upsert_player_snaps(rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into nfl.player_snaps
  select (jsonb_populate_record(null::nfl.player_snaps, r || jsonb_build_object('imported_at', now()))).*
  from jsonb_array_elements(rows) r
  on conflict (game_id, pfr_player_id) do update set
    player_id = excluded.player_id, player_name = excluded.player_name, season = excluded.season,
    week = excluded.week, game_type = excluded.game_type, team = excluded.team, opponent = excluded.opponent,
    position = excluded.position, offense_snaps = excluded.offense_snaps, offense_pct = excluded.offense_pct,
    defense_snaps = excluded.defense_snaps, defense_pct = excluded.defense_pct,
    st_snaps = excluded.st_snaps, st_pct = excluded.st_pct, imported_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- A season's weekly charts are replaced whole (a player dropped from a chart
-- must disappear from it).
create or replace function public.nfl_replace_depth_weekly(p_season int, rows jsonb, p_first boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_first then delete from nfl.depth_weekly where season = p_season; end if;
  insert into nfl.depth_weekly
  select (jsonb_populate_record(null::nfl.depth_weekly, r || jsonb_build_object('imported_at', now()))).*
  from jsonb_array_elements(rows) r
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- A day's snapshot is replaced whole for the days given.
create or replace function public.nfl_replace_depth_daily(p_days date[], rows jsonb, p_first boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_first then delete from nfl.depth_daily where as_of = any (p_days); end if;
  insert into nfl.depth_daily
  select (jsonb_populate_record(null::nfl.depth_daily, r || jsonb_build_object('imported_at', now()))).*
  from jsonb_array_elements(rows) r
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.nfl_upsert_player_snaps(jsonb) from public, anon, authenticated;
revoke all on function public.nfl_replace_depth_weekly(int, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.nfl_replace_depth_daily(date[], jsonb, boolean) from public, anon, authenticated;
grant execute on function public.nfl_upsert_player_snaps(jsonb) to service_role;
grant execute on function public.nfl_replace_depth_weekly(int, jsonb, boolean) to service_role;
grant execute on function public.nfl_replace_depth_daily(date[], jsonb, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Views.
-- ---------------------------------------------------------------------------
-- Snaps with franchise, player name/slug, and the team's offensive plays in
-- that game (the most offensive snaps any team-mate played: the QB or a
-- lineman on the field for every play).
create or replace view public.nfl_player_snaps with (security_invoker = true) as
select s.season, s.week, s.game_type, s.game_id, s.player_id, s.pfr_player_id,
  coalesce(p.name, s.player_name) as player_name, p.slug as player_slug,
  s.position, tf.franchise as team, tf.slug as team_slug, opf.franchise as opponent,
  s.offense_snaps, s.offense_pct, s.defense_snaps, s.defense_pct, s.st_snaps, s.st_pct,
  max(s.offense_snaps) over (partition by s.game_id, s.team) as team_offense_snaps
from nfl.player_snaps s
join nfl.team_codes tc on tc.code = s.team
join nfl.franchises tf on tf.franchise = tc.franchise
join nfl.team_codes oc on oc.code = s.opponent
join nfl.franchises opf on opf.franchise = oc.franchise
left join nfl.players p on p.player_id = s.player_id;

-- The depth chart in force for each team before each game: the weekly chart for
-- that week (to 2024), or the last daily snapshot on or before game day (2025 on).
create or replace view public.nfl_depth_by_game with (security_invoker = true) as
with team_games as (
  select g.game_id, g.season, g.week, g.game_type, g.gameday, g.home_code as code from nfl.games g
  union all
  select g.game_id, g.season, g.week, g.game_type, g.gameday, g.away_code from nfl.games g
)
select tg.game_id, tg.season, tg.week, tg.gameday, tc.franchise as team,
  w.player_id, w.player_name, w.position, w.slot, w.depth, 'weekly'::text as source, null::date as as_of
from team_games tg
join nfl.team_codes tc on tc.code = tg.code
join nfl.depth_weekly w on w.season = tg.season and w.week = tg.week and w.game_type = tg.game_type
  and w.team in (select c.code from nfl.team_codes c where c.franchise = tc.franchise)
union all
select tg.game_id, tg.season, tg.week, tg.gameday, tc.franchise,
  d.player_id, d.player_name, d.position, d.slot::text, d.depth, 'daily', d.as_of
from team_games tg
join nfl.team_codes tc on tc.code = tg.code
join lateral (
  select max(x.as_of) as as_of from nfl.depth_daily x
  where x.season = tg.season and x.as_of <= tg.gameday
    and x.team in (select c.code from nfl.team_codes c where c.franchise = tc.franchise)
) last on last.as_of is not null
join nfl.depth_daily d on d.as_of = last.as_of
  and d.team in (select c.code from nfl.team_codes c where c.franchise = tc.franchise);

-- Each team's current chart: its latest daily snapshot.
create or replace view public.nfl_depth_latest with (security_invoker = true) as
select d.as_of, d.snapshot_at, d.season, tc.franchise as team, d.player_id,
  coalesce(p.name, d.player_name) as player_name, p.slug as player_slug, d.position, d.slot, d.depth
from nfl.depth_daily d
join nfl.team_codes tc on tc.code = d.team
left join nfl.players p on p.player_id = d.player_id
where d.as_of = (select max(x.as_of) from nfl.depth_daily x where x.team = d.team);

grant select on public.nfl_player_snaps, public.nfl_depth_by_game, public.nfl_depth_latest to anon, authenticated, service_role;
comment on view public.nfl_player_snaps is 'NFL snap counts per player per game (nflverse, from 2013), with the team''s offensive plays in that game.';
comment on view public.nfl_depth_by_game is 'The depth chart in force for each team before each game: weekly charts to 2024, the last daily snapshot on or before game day from 2025. Fantasy positions only.';
comment on view public.nfl_depth_latest is 'Each NFL team''s latest daily depth chart (fantasy positions).';

-- ---------------------------------------------------------------------------
-- Integrity: two more checks (snap counts present; depth chart recent). The
-- earlier checks unchanged, from 20261005270000.
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
  union all
  select 'nfl_snaps_fresh', case when n = 0 then 'ok' else 'failed' end, n,
    'Scored NFL games (2013+) older than 3 days with no snap counts'
  from (select count(*) n from nfl.games g
        where g.season >= 2013 and g.home_score is not null and g.kickoff_at < now() - interval '3 days'
          and not exists (select 1 from nfl.player_snaps s where s.game_id = g.game_id)) x
  union all
  select 'nfl_depth_fresh', case when n = 0 then 'ok' else 'failed' end, n,
    'Games in the next 10 days while the latest daily depth chart is more than 3 days old'
  from (select count(*) n from nfl.games g
        where g.kickoff_at between now() and now() + interval '10 days'
          and coalesce((select max(d.as_of) from nfl.depth_daily d), date '2000-01-01') < current_date - 3) x
$$;
revoke all on function public.check_nfl_integrity() from public, anon, authenticated;
grant execute on function public.check_nfl_integrity() to service_role;

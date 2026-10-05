-- ============================================================================
-- NFL Match Projector: weekly fantasy projections per player per game.
--
-- Written by scripts/nfl_projections.py (daily, after the NFL import) for
-- games kicking off in the next 8 days. Method per position from Model Lab
-- experiment NP1 (5 Oct 2026): 'np1' for QB, WR, TE (passed the holdout);
-- 'season_avg' for RB and K (did not), shown as the season average.
-- Projections assume the player plays; injury status comes from the latest
-- nflverse injury report for that week and is shown beside them.
-- ============================================================================

create table nfl.projections (
  game_id text not null references nfl.games (game_id),
  player_id text not null references nfl.players (player_id),
  season int not null,
  week int not null,
  team text not null,                 -- team code (nfl.team_codes)
  opponent text not null,
  position text not null,             -- QB RB WR TE K (FB as RB)
  method text not null check (method in ('np1', 'season_avg')),
  proj_ppr numeric not null,
  proj_half numeric not null,
  proj_std numeric not null,
  low_ppr numeric not null,           -- 20th percentile (fitted on tuning, ~60% inside on 2024)
  high_ppr numeric not null,          -- 80th percentile
  base_ppr numeric not null,          -- recency-weighted, shrunk points per game
  season_avg_ppr numeric,             -- P0: this season's average (last season's in week 1)
  team_implied numeric,               -- market-implied team points for this game
  team_usual numeric,                 -- the same, averaged over the games behind base
  opp_factor numeric,                 -- opponent points allowed to the position / league (shrunk; 1 = average)
  games_used int not null,
  injury_status text,                 -- Out / Doubtful / Questionable (report_status), null = not listed
  injury text,                        -- primary injury on the report
  practice_status text,
  computed_at timestamptz not null default now(),
  primary key (game_id, player_id)
);
create index nfl_projections_week_idx on nfl.projections (season, week);

alter table nfl.projections enable row level security;
create policy "public read" on nfl.projections for select to anon, authenticated using (true);
grant select on nfl.projections to anon, authenticated;
grant all on nfl.projections to service_role;

-- Replace the projections for a set of games in one transaction.
create or replace function public.nfl_replace_projections(p_game_ids text[], p_rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from nfl.projections where game_id = any (p_game_ids);
  insert into nfl.projections
  select (jsonb_populate_record(null::nfl.projections, r || jsonb_build_object('computed_at', now()))).*
  from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.nfl_replace_projections(text[], jsonb) from public, anon, authenticated;
grant execute on function public.nfl_replace_projections(text[], jsonb) to service_role;

create view public.nfl_projections with (security_invoker = true) as
select pr.game_id, pr.season, pr.week, g.kickoff_at, g.gameday,
  pr.player_id, p.slug as player_slug, p.name as player_name, pr.position,
  tf.franchise as team, tf.slug as team_slug, tf.short_name as team_short, tf.name as team_name,
  opf.franchise as opponent, opf.slug as opponent_slug, opf.short_name as opponent_short,
  (g.home_code = pr.team) as at_home,
  pr.method, pr.proj_ppr, pr.proj_half, pr.proj_std, pr.low_ppr, pr.high_ppr,
  pr.base_ppr, pr.season_avg_ppr, pr.team_implied, pr.team_usual, pr.opp_factor, pr.games_used,
  pr.injury_status, pr.injury, pr.practice_status, pr.computed_at
from nfl.projections pr
join nfl.players p on p.player_id = pr.player_id
join nfl.games g on g.game_id = pr.game_id
join nfl.team_codes tc on tc.code = pr.team
join nfl.franchises tf on tf.franchise = tc.franchise
join nfl.team_codes oc on oc.code = pr.opponent
join nfl.franchises opf on opf.franchise = oc.franchise;

grant select on public.nfl_projections to anon, authenticated, service_role;
comment on view public.nfl_projections is 'NFL Match Projector: projected fantasy points per player per upcoming game (method np1 for QB/WR/TE, season_avg for RB/K, per Model Lab NP1), with the inputs behind each number and injury status.';

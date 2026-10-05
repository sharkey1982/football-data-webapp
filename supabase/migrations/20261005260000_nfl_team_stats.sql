-- ============================================================================
-- NFL team stats (Chris, 5 Oct 2026: "we need team stats data -- particularly
-- where it overlaps with fantasy football inputs").
--
-- nflverse stats_team_week, one row per team per game since 2002 (regular
-- season and play-offs), loaded by scripts/nfl_import.py. The season view
-- pairs each game with the opponent's row, so a team's defence is what its
-- opponents managed against it, and adds the fantasy inputs: volume (plays,
-- pass rate), and team defence / special teams (DST) fantasy points.
--
-- DST scoring (standard): sack 1, interception 2, fumble recovery 2, safety
-- 2, blocked kick 2, defensive or special-teams TD 6; points allowed 0: 10,
-- 1-6: 7, 7-13: 4, 14-20: 1, 21-27: 0, 28-34: -1, 35+: -4 (all points the
-- opponent scored).
-- ============================================================================

create table if not exists nfl.team_weeks (
  game_id text not null,
  team text not null,                     -- team code (nfl.team_codes)
  opponent text not null,
  season int not null,
  week int not null,
  season_type text not null,              -- REG / POST
  completions int not null default 0,
  attempts int not null default 0,
  passing_yards int not null default 0,   -- gross; net = passing_yards - sack_yards_lost
  passing_tds int not null default 0,
  passing_interceptions int not null default 0,
  sacks_suffered int not null default 0,
  sack_yards_lost int not null default 0,
  passing_first_downs int not null default 0,
  passing_epa numeric,
  carries int not null default 0,
  rushing_yards int not null default 0,
  rushing_tds int not null default 0,
  rushing_first_downs int not null default 0,
  rushing_epa numeric,
  fumbles_lost int not null default 0,    -- all fumbles lost (nflverse fumbles_lost_total)
  special_teams_tds int not null default 0,
  def_sacks numeric not null default 0,
  def_interceptions int not null default 0,
  def_tds int not null default 0,
  def_safeties int not null default 0,
  fumble_recovery_opp int not null default 0,
  def_blocks int not null default 0,      -- punts + field goals + PATs blocked
  penalties int not null default 0,
  penalty_yards int not null default 0,
  fg_made int not null default 0,
  fg_att int not null default 0,
  pat_made int not null default 0,
  pat_att int not null default 0,
  imported_at timestamptz not null default now(),
  primary key (game_id, team)
);
create index if not exists nfl_team_weeks_season_idx on nfl.team_weeks (season, team);

alter table nfl.team_weeks enable row level security;
drop policy if exists "public read" on nfl.team_weeks;
create policy "public read" on nfl.team_weeks for select to anon, authenticated using (true);
grant select on nfl.team_weeks to anon, authenticated;
grant all on nfl.team_weeks to service_role;

create or replace function public.nfl_upsert_team_weeks(rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into nfl.team_weeks
  select (jsonb_populate_record(null::nfl.team_weeks, r || jsonb_build_object('imported_at', now()))).*
  from jsonb_array_elements(rows) r
  on conflict (game_id, team) do update set
    opponent = excluded.opponent, season = excluded.season, week = excluded.week, season_type = excluded.season_type,
    completions = excluded.completions, attempts = excluded.attempts, passing_yards = excluded.passing_yards,
    passing_tds = excluded.passing_tds, passing_interceptions = excluded.passing_interceptions,
    sacks_suffered = excluded.sacks_suffered, sack_yards_lost = excluded.sack_yards_lost,
    passing_first_downs = excluded.passing_first_downs, passing_epa = excluded.passing_epa,
    carries = excluded.carries, rushing_yards = excluded.rushing_yards, rushing_tds = excluded.rushing_tds,
    rushing_first_downs = excluded.rushing_first_downs, rushing_epa = excluded.rushing_epa,
    fumbles_lost = excluded.fumbles_lost, special_teams_tds = excluded.special_teams_tds,
    def_sacks = excluded.def_sacks, def_interceptions = excluded.def_interceptions, def_tds = excluded.def_tds,
    def_safeties = excluded.def_safeties, fumble_recovery_opp = excluded.fumble_recovery_opp,
    def_blocks = excluded.def_blocks, penalties = excluded.penalties, penalty_yards = excluded.penalty_yards,
    fg_made = excluded.fg_made, fg_att = excluded.fg_att, pat_made = excluded.pat_made, pat_att = excluded.pat_att,
    imported_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.nfl_upsert_team_weeks(jsonb) from public, anon, authenticated;
grant execute on function public.nfl_upsert_team_weeks(jsonb) to service_role;

-- Standard DST fantasy points for one game.
create or replace function nfl.dst_points(sacks numeric, ints int, fum_rec int, safeties int, blocks int, tds int, allowed int)
returns numeric language sql immutable set search_path = '' as $$
  select sacks + 2 * ints + 2 * fum_rec + 2 * safeties + 2 * blocks + 6 * tds
    + case when allowed is null then 0
           when allowed = 0 then 10 when allowed <= 6 then 7 when allowed <= 13 then 4
           when allowed <= 20 then 1 when allowed <= 27 then 0 when allowed <= 34 then -1 else -4 end
$$;
grant execute on function nfl.dst_points(numeric, int, int, int, int, int, int) to anon, authenticated, service_role;

-- One row per team per game, with the opponent's row beside it and the score.
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
    case when hc.franchise = tc.franchise then g.away_score else g.home_score end) as dst_points
from nfl.team_weeks t
join nfl.team_codes tc on tc.code = t.team
join nfl.team_codes oc on oc.code = t.opponent
join nfl.games g on g.game_id = t.game_id
join nfl.team_codes hc on hc.code = g.home_code
left join nfl.team_weeks o on o.game_id = t.game_id and o.team = t.opponent;

-- Regular-season totals per team-season (per-game figures are worked out on the page).
create or replace view public.nfl_team_seasons with (security_invoker = true) as
select tg.season, tg.franchise, f.slug, f.name as team_name, f.short_name, f.conference, f.division,
  count(*) as games,
  sum(points_for) as points_for, sum(points_against) as points_against,
  sum(plays) as plays, sum(attempts) as attempts, sum(carries) as carries, sum(sacks_suffered) as sacks_suffered,
  sum(pass_yards_net) as pass_yards, sum(rushing_yards) as rush_yards,
  sum(passing_tds) as pass_tds, sum(rushing_tds) as rush_tds, sum(first_downs) as first_downs,
  sum(giveaways) as giveaways, sum(takeaways) as takeaways, sum(def_sacks) as def_sacks, sum(def_st_tds) as def_st_tds,
  sum(opp_plays) as opp_plays, sum(opp_attempts) as opp_attempts, sum(opp_carries) as opp_carries,
  sum(opp_pass_yards_net) as opp_pass_yards, sum(opp_rushing_yards) as opp_rush_yards,
  sum(opp_passing_tds) as opp_pass_tds, sum(opp_rushing_tds) as opp_rush_tds,
  sum(penalties) as penalties, sum(penalty_yards) as penalty_yards,
  round(sum(passing_epa) + sum(rushing_epa), 1) as offence_epa,
  sum(dst_points) as dst_points
from public.nfl_team_games tg
join nfl.franchises f on f.franchise = tg.franchise
where tg.season_type = 'REG'
group by tg.season, tg.franchise, f.slug, f.name, f.short_name, f.conference, f.division;

grant select on public.nfl_team_games, public.nfl_team_seasons to anon, authenticated, service_role;
comment on view public.nfl_team_games is 'NFL team stats per game (nflverse stats_team_week) with the opponent''s row and the score: volume, yards, TDs, turnovers, DST fantasy points.';
comment on view public.nfl_team_seasons is 'NFL regular-season team stats per team-season: offence, defence (what opponents managed), turnovers, fantasy volume and DST fantasy points (standard scoring, nfl.dst_points).';

-- ---------------------------------------------------------------------------
-- Integrity: every scored game has team stats for both sides (the 7 existing
-- checks unchanged, from 20261004180000).
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
          and (select count(*) from nfl.team_weeks t where t.game_id = g.game_id) <> 2) x
$$;
revoke all on function public.check_nfl_integrity() from public, anon, authenticated;
grant execute on function public.check_nfl_integrity() to service_role;

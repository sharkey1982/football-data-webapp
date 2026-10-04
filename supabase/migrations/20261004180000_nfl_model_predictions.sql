-- ============================================================================
-- NFL model on the site (4 Oct 2026), following experiment N1:
--   (A) passed -- the margin Elo beats a home-field guess on the sealed
--       holdout (-0.053 nats, t -4.0), so it is shown beside the market with
--       the gap stated, as for football;
--   (B) null result -- it adds nothing to the market (pool weight -0.005).
--
-- nfl.model_predictions: one row per game per daily run, APPEND-ONLY (the
-- FPL lesson: a stored prediction is never overwritten). Each row also keeps
-- the market at that moment (moneylines, spread, total), which builds the
-- opening-to-closing record nflverse does not keep. Pages read the latest
-- prediction made BEFORE kick-off (point-in-time rule): no hindsight rows,
-- so games before today have no model prediction at all.
-- ============================================================================

create table nfl.model_predictions (
  prediction_id bigint generated always as identity primary key,
  game_id text not null references nfl.games(game_id),
  model_version text not null,
  predicted_at timestamptz not null default now(),
  home_rating numeric not null,
  away_rating numeric not null,
  home_edge numeric not null,           -- Elo points incl. home advantage
  p_home numeric not null,              -- P(home win)
  predicted_margin numeric not null,    -- home minus away, points
  market_p_home numeric,                -- de-vigged moneyline at predicted_at (N0 benchmark)
  spread_line numeric,
  total_line numeric,
  home_moneyline int,
  away_moneyline int
);
create index nfl_model_predictions_game on nfl.model_predictions (game_id, predicted_at desc);
create trigger nfl_model_predictions_append_only before update or delete on nfl.model_predictions
  for each row execute function public.refuse_snapshot_changes();
alter table nfl.model_predictions enable row level security;
create policy "public read" on nfl.model_predictions for select to anon, authenticated using (true);
grant select on nfl.model_predictions to anon, authenticated;
grant all on nfl.model_predictions to service_role;

create or replace function public.nfl_insert_predictions(rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into nfl.model_predictions (game_id, model_version, home_rating, away_rating, home_edge, p_home,
    predicted_margin, market_p_home, spread_line, total_line, home_moneyline, away_moneyline)
  select r->>'game_id', r->>'model_version', (r->>'home_rating')::numeric, (r->>'away_rating')::numeric,
    (r->>'home_edge')::numeric, (r->>'p_home')::numeric, (r->>'predicted_margin')::numeric,
    (r->>'market_p_home')::numeric, (r->>'spread_line')::numeric, (r->>'total_line')::numeric,
    (r->>'home_moneyline')::int, (r->>'away_moneyline')::int
  from jsonb_array_elements(rows) r
  -- Point-in-time: never store a prediction for a game that has kicked off.
  join nfl.games g on g.game_id = r->>'game_id'
  where g.home_score is null and (g.kickoff_at is null or g.kickoff_at > now());
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.nfl_insert_predictions(jsonb) from public, anon, authenticated;
grant execute on function public.nfl_insert_predictions(jsonb) to service_role;

-- The model as the site shows it: the latest prediction made before kick-off.
create view public.nfl_game_model with (security_invoker = true) as
select distinct on (p.game_id)
  p.game_id, p.model_version, p.predicted_at, p.home_edge, p.p_home, p.predicted_margin,
  p.market_p_home, p.spread_line, p.total_line
from nfl.model_predictions p
join nfl.games g on g.game_id = p.game_id
where g.kickoff_at is null or p.predicted_at < g.kickoff_at
order by p.game_id, p.predicted_at desc;
grant select on public.nfl_game_model to anon, authenticated, service_role;
comment on view public.nfl_game_model is 'NFL model (Elo, experiment N1) per game: the latest prediction made before kick-off, with the market at that moment. No hindsight rows.';

-- Freshness: every game kicking off in the next 48 hours needs a prediction
-- from the last 36 hours (the daily run predicts the coming 8 days).
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
$$;
revoke all on function public.check_nfl_integrity() from public, anon, authenticated;
grant execute on function public.check_nfl_integrity() to service_role;

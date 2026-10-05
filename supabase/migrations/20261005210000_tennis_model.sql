-- ============================================================================
-- Tennis match model (5 Oct 2026): who wins a meeting between two players,
-- allowing for the surface. Design: Project doc tennis-h2h-model-2026-10-05.
--
-- Ratings: Elo per player, overall and per surface (Hard, Clay, Grass,
-- Carpet), rebuilt in date order from every played match. K = 200 /
-- (matches + 5)^0.4 (new players move fast, established ones slowly);
-- retirements count half; walkovers don't count. A player's first rating on
-- a surface starts from their overall rating. Everyone starts at 1500.
--
-- Win probability: a logistic model on the two players' differences in
--   overall Elo, surface Elo, ranking (log), experience (overall and on the
--   surface), best of five on that surface, and previous meetings.
-- Coefficients fitted on 2003-2015, scaled on 2016-2019 so the stated
-- chances match how often favourites won, and tested on 2020-2026:
-- 64.8% of 31,944 matches called right (the bookmakers' average price:
-- 68.1%); when it says 70%, the favourite won 70-72% of the time.
-- The same coefficients are in src/lib/tennisModel.ts (keep in step).
--
-- Rebuilt by tennis_refresh() (pg_cron every two hours after an import).
-- ============================================================================

create table if not exists tennis.player_ratings (
  player_id bigint not null references tennis.players(player_id) on delete cascade,
  surface text not null,              -- 'All', 'Hard', 'Clay', 'Grass', 'Carpet'
  rating double precision not null,
  matches int not null,
  latest_rank int,                    -- ranking at the player's last match (the model's ranking input)
  last_match date,
  primary key (player_id, surface)
);
create table if not exists tennis.match_model (
  source_key text primary key,
  elo_w double precision, elo_l double precision,
  selo_w double precision, selo_l double precision,
  n_w int, n_l int, ns_w int, ns_l int,
  h2h_w int, h2h_l int,
  p_winner double precision            -- the model's pre-match chance for the eventual winner
);
do $$ declare t text; begin
  foreach t in array array['player_ratings','match_model'] loop
    execute format('alter table tennis.%I enable row level security', t);
    execute format('drop policy if exists "public read" on tennis.%I', t);
    execute format('create policy "public read" on tennis.%I for select to anon, authenticated using (true)', t);
    execute format('grant select on tennis.%I to anon, authenticated', t);
    execute format('grant all on tennis.%I to service_role', t);
  end loop;
end $$;

-- The model, one place in SQL. Inputs from player A's side.
create or replace function tennis.model_p(
  elo_a double precision, elo_b double precision, selo_a double precision, selo_b double precision,
  rank_a int, rank_b int, n_a int, n_b int, ns_a int, ns_b int, best_of int, h2h_a int, h2h_b int)
returns double precision language sql immutable as $$
  select 1 / (1 + exp(-(
      0.7313 * d_elo
    + 0.3997 * d_selo
    + 0.2286 * (ln(coalesce(nullif(rank_b, 0), 1500)) - ln(coalesce(nullif(rank_a, 0), 1500)))
    - 0.2532 * d_elo * ln(1 + least(n_a, n_b)) / 5
    + 0.3175 * d_selo * ln(1 + least(ns_a, ns_b)) / 5
    + 0.5583 * d_selo * (case when best_of = 5 then 1 else 0 end)
    + 0.1453 * (h2h_a - h2h_b)::double precision / (h2h_a + h2h_b + 2))))
  from (select (elo_a - elo_b) / 400 d_elo, (selo_a - selo_b) / 400 d_selo) d
$$;

create or replace function tennis.rebuild_ratings() returns void language plpgsql as $$
declare
  m record;
  maxid int := (select coalesce(max(player_id), 0) from tennis.players);
  r double precision[] := array_fill(1500::double precision, array[maxid]);
  n int[] := array_fill(0, array[maxid]);
  sr double precision[] := array_fill(null::double precision, array[maxid * 4]);
  sn int[] := array_fill(0, array[maxid * 4]);
  keys text[] := '{}'; ew double precision[] := '{}'; el double precision[] := '{}';
  sw double precision[] := '{}'; sl double precision[] := '{}';
  nw int[] := '{}'; nl int[] := '{}'; nsw int[] := '{}'; nsl int[] := '{}';
  si int; iw int; il int; e double precision; kw double precision; kl double precision; mult double precision; i int := 0;
begin
  for m in
    select source_key, winner_id w, loser_id l, surface, tennis.result_of(status, w_games) res
    from tennis.matches
    where tennis.result_of(status, w_games) in ('Completed', 'Retired', 'Awarded', 'Disqualified')
    order by tour, match_date, tennis.round_order(round), source_key
  loop
    si := case m.surface when 'Clay' then 2 when 'Grass' then 3 when 'Carpet' then 4 else 1 end;
    iw := (m.w - 1) * 4 + si; il := (m.l - 1) * 4 + si;
    if sn[iw] = 0 then sr[iw] := r[m.w]; end if;
    if sn[il] = 0 then sr[il] := r[m.l]; end if;
    i := i + 1;
    keys[i] := m.source_key; ew[i] := r[m.w]; el[i] := r[m.l]; sw[i] := sr[iw]; sl[i] := sr[il];
    nw[i] := n[m.w]; nl[i] := n[m.l]; nsw[i] := sn[iw]; nsl[i] := sn[il];
    mult := case when m.res = 'Retired' then 0.5 else 1 end;
    -- overall
    e := 1 / (1 + power(10, (r[m.l] - r[m.w]) / 400));
    kw := 200 / power(n[m.w] + 5, 0.4) * mult; kl := 200 / power(n[m.l] + 5, 0.4) * mult;
    r[m.w] := r[m.w] + kw * (1 - e); r[m.l] := r[m.l] - kl * (1 - e);
    n[m.w] := n[m.w] + 1; n[m.l] := n[m.l] + 1;
    -- surface
    e := 1 / (1 + power(10, (sr[il] - sr[iw]) / 400));
    kw := 200 / power(sn[iw] + 5, 0.4) * mult; kl := 200 / power(sn[il] + 5, 0.4) * mult;
    sr[iw] := sr[iw] + kw * (1 - e); sr[il] := sr[il] - kl * (1 - e);
    sn[iw] := sn[iw] + 1; sn[il] := sn[il] + 1;
  end loop;

  -- Upserts rather than clearing the tables first, so a failed rebuild leaves
  -- the last good ratings in place. (Rows for a deleted match or player are
  -- left behind / removed by the foreign key; the views only join live rows.)
  insert into tennis.match_model (source_key, elo_w, elo_l, selo_w, selo_l, n_w, n_l, ns_w, ns_l)
  select * from unnest(keys, ew, el, sw, sl, nw, nl, nsw, nsl)
  on conflict (source_key) do update set elo_w = excluded.elo_w, elo_l = excluded.elo_l, selo_w = excluded.selo_w,
    selo_l = excluded.selo_l, n_w = excluded.n_w, n_l = excluded.n_l, ns_w = excluded.ns_w, ns_l = excluded.ns_l;

  -- Previous meetings (played), then the model's chance for the winner.
  update tennis.match_model mm set h2h_w = h.hw, h2h_l = h.hl,
    p_winner = tennis.model_p(mm.elo_w, mm.elo_l, mm.selo_w, mm.selo_l, h.w_rank, h.l_rank,
                              mm.n_w, mm.n_l, mm.ns_w, mm.ns_l, h.best_of, h.hw, h.hl)
  from (
    select x.source_key, x.w_rank, x.l_rank, x.best_of,
      (count(*) filter (where y.winner_id = x.winner_id))::int hw,
      (count(*) filter (where y.winner_id = x.loser_id))::int hl
    from tennis.matches x
    left join tennis.matches y
      on least(y.winner_id, y.loser_id) = least(x.winner_id, x.loser_id)
     and greatest(y.winner_id, y.loser_id) = greatest(x.winner_id, x.loser_id)
     and (y.match_date, tennis.round_order(y.round), y.source_key) < (x.match_date, tennis.round_order(x.round), x.source_key)
     and tennis.result_of(y.status, y.w_games) in ('Completed', 'Retired', 'Awarded', 'Disqualified')
    group by x.source_key, x.w_rank, x.l_rank, x.best_of
  ) h
  where h.source_key = mm.source_key;

  insert into tennis.player_ratings (player_id, surface, rating, matches)
  select p, 'All', r[p], n[p] from generate_subscripts(r, 1) p where n[p] > 0
  union all
  select p, s.name, sr[(p - 1) * 4 + s.i], sn[(p - 1) * 4 + s.i]
  from generate_subscripts(r, 1) p
  cross join (values (1, 'Hard'), (2, 'Clay'), (3, 'Grass'), (4, 'Carpet')) s(i, name)
  where sn[(p - 1) * 4 + s.i] > 0
  on conflict (player_id, surface) do update set rating = excluded.rating, matches = excluded.matches;

  update tennis.player_ratings pr set latest_rank = lt.rnk, last_match = lt.match_date
  from (
    select distinct on (pid) pid, rnk, match_date
    from (
      select winner_id pid, w_rank rnk, match_date, tennis.round_order(round) ro from tennis.matches
      union all
      select loser_id, l_rank, match_date, tennis.round_order(round) from tennis.matches
    ) s
    order by pid, match_date desc, ro desc
  ) lt
  where lt.pid = pr.player_id;
end $$;

create or replace function public.tennis_refresh() returns text language plpgsql security definer set search_path = '' as $$
begin
  perform tennis.rebuild_events();
  perform tennis.rebuild_summaries();
  perform tennis.rebuild_ratings();
  return format('%s events, %s editions, %s player totals, %s ratings',
    (select count(*) from tennis.events), (select count(*) from tennis.editions), (select count(*) from tennis.player_totals),
    (select count(*) from tennis.player_ratings));
end $$;
revoke all on function public.tennis_refresh() from public, anon, authenticated;
grant execute on function public.tennis_refresh() to service_role;

-- ---------------------------------------------------------------------------
-- Site views
-- ---------------------------------------------------------------------------
-- One row per player and surface ('All' included), with the player's latest
-- ranking (as at their last match) for the model's ranking input.
create or replace view public.tennis_ratings with (security_invoker = true) as
select pr.player_id, p.tour, p.slug, p.name, pr.surface, round(pr.rating::numeric, 1)::double precision rating, pr.matches,
  pr.latest_rank, pr.last_match
from tennis.player_ratings pr
join tennis.players p using (player_id);

-- The model's pre-match chance for every played match (for meetings lists).
create or replace view public.tennis_match_model with (security_invoker = true) as
select source_key, p_winner from tennis.match_model;

-- How well the model has done, by tour and season, beside the bookmakers.
create or replace view public.tennis_model_record with (security_invoker = true) as
with x as (
  select m.tour, m.year, mm.p_winner,
    case
      when m.avg_w > 1 and m.avg_l > 1 then (1 / m.avg_w) / (1 / m.avg_w + 1 / m.avg_l)
      when m.b365_w > 1 and m.b365_l > 1 then (1 / m.b365_w) / (1 / m.b365_w + 1 / m.b365_l)
      when m.ps_w > 1 and m.ps_l > 1 then (1 / m.ps_w) / (1 / m.ps_w + 1 / m.ps_l)
    end p_market
  from tennis.match_model mm join tennis.matches m using (source_key)
  where mm.p_winner is not null
)
select tour, year, count(*) matches,
  round(avg((p_winner > 0.5)::int)::numeric, 4)::double precision model_right,
  round(avg((1 - p_winner) ^ 2)::numeric, 4)::double precision model_brier,
  count(p_market) market_matches,
  round(avg((p_market > 0.5)::int)::numeric, 4)::double precision market_right
from x group by tour, year;

grant select on public.tennis_ratings, public.tennis_match_model, public.tennis_model_record to anon, authenticated;

-- Build the ratings now (the scheduled refresh keeps them current).
select tennis.rebuild_ratings();

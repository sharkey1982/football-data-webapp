-- ============================================================================
-- Tennis phase 1: tour-level results (4 Oct 2026). Design:
-- claude/tennis-design-2026-10-04.md (Project docs).
--
-- Source: tennis-data.co.uk, one workbook per tour per year (ATP from 2000,
-- WTA from 2007). Cloudflare refuses cloud downloads (tested from GitHub
-- Actions, 4 Oct), so scripts/tennis_import.py runs on Chris's PC.
--
-- Layout as for nfl: raw tables in the unexposed tennis schema; the site reads
-- public.tennis_* views (security_invoker); the importer writes only through
-- public.tennis_upsert_matches, executable by service_role alone.
--
-- The source has no match or player ids:
--   * a match is keyed by tour|year|tournament|round|winner|loser (a pair
--     cannot meet twice in one round of one event). The importer refuses a
--     file holding a duplicate key before anything is written.
--   * a player is a source name string per tour ("Sinner J."), mapped through
--     player_aliases so spelling changes can later be merged onto one player
--     without touching matches.
-- Every source row is also kept whole in raw, so a column not parsed today
-- can be extracted later without re-importing.
-- ============================================================================

create schema if not exists tennis;
grant usage on schema tennis to anon, authenticated, service_role;

create table tennis.tournaments (
  tournament_id bigint generated always as identity primary key,
  tour text not null check (tour in ('ATP', 'WTA')),
  name text not null,                       -- source Tournament
  slug text not null,
  unique (tour, name),
  unique (tour, slug)
);

create table tennis.players (
  player_id bigint generated always as identity primary key,
  tour text not null check (tour in ('ATP', 'WTA')),
  name text not null,                       -- display name, initially the source string
  slug text not null,
  unique (tour, slug)
);

create table tennis.player_aliases (
  tour text not null check (tour in ('ATP', 'WTA')),
  source_name text not null,
  player_id bigint not null references tennis.players(player_id),
  primary key (tour, source_name)
);

create table tennis.matches (
  source_key text primary key,              -- tour|year|tournament|round|winner|loser
  tour text not null check (tour in ('ATP', 'WTA')),
  year int not null,                        -- the source file's year
  tournament_id bigint not null references tennis.tournaments(tournament_id),
  location text,
  series text,                              -- ATP Series / WTA Tier as published
  court text,                               -- Indoor / Outdoor
  surface text,                             -- Hard / Clay / Grass / Carpet
  round text not null,
  best_of int,
  match_date date not null,
  winner_id bigint not null references tennis.players(player_id),
  loser_id bigint not null references tennis.players(player_id),
  w_rank int, l_rank int,
  w_pts int, l_pts int,
  w_games int[],                            -- games per set, in order
  l_games int[],
  w_sets int, l_sets int,
  status text,                              -- source Comment: Completed / Retired / Walkover / ...
  b365_w numeric, b365_l numeric,
  ps_w numeric, ps_l numeric,               -- Pinnacle
  max_w numeric, max_l numeric,
  avg_w numeric, avg_l numeric,
  bfe_w numeric, bfe_l numeric,             -- Betfair exchange (recent years)
  raw jsonb not null,
  imported_at timestamptz not null default now(),
  check (winner_id <> loser_id)
);
create index tennis_matches_year_idx on tennis.matches (tour, year);
create index tennis_matches_date_idx on tennis.matches (match_date);
create index tennis_matches_winner_idx on tennis.matches (winner_id);
create index tennis_matches_loser_idx on tennis.matches (loser_id);
create index tennis_matches_tournament_idx on tennis.matches (tournament_id, year);

alter table tennis.tournaments enable row level security;
alter table tennis.players enable row level security;
alter table tennis.player_aliases enable row level security;
alter table tennis.matches enable row level security;
create policy "public read" on tennis.tournaments for select to anon, authenticated using (true);
create policy "public read" on tennis.players for select to anon, authenticated using (true);
create policy "public read" on tennis.player_aliases for select to anon, authenticated using (true);
create policy "public read" on tennis.matches for select to anon, authenticated using (true);
grant select on all tables in schema tennis to anon, authenticated;
grant all on all tables in schema tennis to service_role;

-- URL slug: lower case, accents dropped, non-alphanumerics to '-'.
create or replace function tennis.slugify(t text)
returns text language sql immutable set search_path = '' as $$
  select trim(both '-' from regexp_replace(lower(translate(t,
    'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿŠšŽžČčĆćŁłŘřŚśŤťĐđ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOOooooooUUUUuuuuYyySsZzCcCcLlRrSsTtDd')),
    '[^a-z0-9]+', '-', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- Writer (service_role only). Each row carries names; tournaments, players
-- and aliases are created on first sight. A player's slug gets the tour
-- suffix (-2, -3) only if a same-slug player exists on that tour already;
-- those collisions are the ones to review by hand.
-- ---------------------------------------------------------------------------
create or replace function public.tennis_upsert_matches(rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int; r record; base text; s text; k int; pid bigint;
begin
  for r in
    select distinct x->>'tour' tour, x->>'tournament' nm from jsonb_array_elements(rows) x
    where not exists (select 1 from tennis.tournaments t where t.tour = x->>'tour' and t.name = x->>'tournament')
  loop
    base := tennis.slugify(r.nm);
    s := base; k := 1;
    while exists (select 1 from tennis.tournaments q where q.tour = r.tour and q.slug = s) loop
      k := k + 1; s := base || '-' || k;
    end loop;
    insert into tennis.tournaments (tour, name, slug) values (r.tour, r.nm, s);
  end loop;

  for r in
    select distinct x->>'tour' tour, nm
    from jsonb_array_elements(rows) x, lateral (values (x->>'winner'), (x->>'loser')) v(nm)
    where not exists (select 1 from tennis.player_aliases a where a.tour = x->>'tour' and a.source_name = nm)
  loop
    base := tennis.slugify(r.nm);
    s := base; k := 1;
    while exists (select 1 from tennis.players q where q.tour = r.tour and q.slug = s) loop
      k := k + 1; s := base || '-' || k;
    end loop;
    insert into tennis.players (tour, name, slug) values (r.tour, r.nm, s) returning player_id into pid;
    insert into tennis.player_aliases (tour, source_name, player_id) values (r.tour, r.nm, pid);
  end loop;

  insert into tennis.matches (source_key, tour, year, tournament_id, location, series, court, surface, round,
    best_of, match_date, winner_id, loser_id, w_rank, l_rank, w_pts, l_pts, w_games, l_games, w_sets, l_sets,
    status, b365_w, b365_l, ps_w, ps_l, max_w, max_l, avg_w, avg_l, bfe_w, bfe_l, raw, imported_at)
  select x->>'source_key', x->>'tour', (x->>'year')::int, t.tournament_id, x->>'location', x->>'series',
    x->>'court', x->>'surface', x->>'round', (x->>'best_of')::int, (x->>'match_date')::date,
    aw.player_id, al.player_id, (x->>'w_rank')::int, (x->>'l_rank')::int, (x->>'w_pts')::int, (x->>'l_pts')::int,
    array(select jsonb_array_elements_text(x->'w_games')::int), array(select jsonb_array_elements_text(x->'l_games')::int),
    (x->>'w_sets')::int, (x->>'l_sets')::int, x->>'status',
    (x->>'b365_w')::numeric, (x->>'b365_l')::numeric, (x->>'ps_w')::numeric, (x->>'ps_l')::numeric,
    (x->>'max_w')::numeric, (x->>'max_l')::numeric, (x->>'avg_w')::numeric, (x->>'avg_l')::numeric,
    (x->>'bfe_w')::numeric, (x->>'bfe_l')::numeric, x->'raw', now()
  from jsonb_array_elements(rows) x
  join tennis.tournaments t on t.tour = x->>'tour' and t.name = x->>'tournament'
  join tennis.player_aliases aw on aw.tour = x->>'tour' and aw.source_name = x->>'winner'
  join tennis.player_aliases al on al.tour = x->>'tour' and al.source_name = x->>'loser'
  on conflict (source_key) do update set
    tournament_id = excluded.tournament_id, location = excluded.location, series = excluded.series,
    court = excluded.court, surface = excluded.surface, best_of = excluded.best_of,
    match_date = excluded.match_date, w_rank = excluded.w_rank, l_rank = excluded.l_rank,
    w_pts = excluded.w_pts, l_pts = excluded.l_pts, w_games = excluded.w_games, l_games = excluded.l_games,
    w_sets = excluded.w_sets, l_sets = excluded.l_sets, status = excluded.status,
    b365_w = excluded.b365_w, b365_l = excluded.b365_l, ps_w = excluded.ps_w, ps_l = excluded.ps_l,
    max_w = excluded.max_w, max_l = excluded.max_l, avg_w = excluded.avg_w, avg_l = excluded.avg_l,
    bfe_w = excluded.bfe_w, bfe_l = excluded.bfe_l, raw = excluded.raw, imported_at = now()
  where tennis.matches.raw is distinct from excluded.raw;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.tennis_upsert_matches(jsonb) from public, anon, authenticated;
grant execute on function public.tennis_upsert_matches(jsonb) to service_role;

-- Reconciliation totals per tour-year: the importer compares these with the
-- file it just read (matches, games, keys) and fails on any difference.
create or replace function public.tennis_year_totals(p_tour text, p_year int)
returns table (matches bigint, games bigint, key_hash text)
language sql stable security definer set search_path = '' as $$
  select count(*),
         coalesce(sum((select coalesce(sum(g), 0) from unnest(m.w_games || m.l_games) g)), 0),
         md5(coalesce(string_agg(m.source_key, '#' order by m.source_key collate "C"), ''))  -- byte order, as Python sorts
  from tennis.matches m where m.tour = p_tour and m.year = p_year
$$;
revoke all on function public.tennis_year_totals(text, int) from public, anon, authenticated;
grant execute on function public.tennis_year_totals(text, int) to service_role;

-- ---------------------------------------------------------------------------
-- Site views.
-- ---------------------------------------------------------------------------
create view public.tennis_matches with (security_invoker = true) as
select m.source_key, m.tour, m.year, m.match_date, t.tournament_id, t.name tournament, t.slug tournament_slug,
  m.location, m.series, m.court, m.surface, m.round, m.best_of,
  m.winner_id, w.name winner, w.slug winner_slug, m.loser_id, l.name loser, l.slug loser_slug,
  m.w_rank, m.l_rank, m.w_pts, m.l_pts, m.w_games, m.l_games, m.w_sets, m.l_sets, m.status,
  m.ps_w, m.ps_l, m.avg_w, m.avg_l, m.max_w, m.max_l, m.b365_w, m.b365_l, m.bfe_w, m.bfe_l
from tennis.matches m
join tennis.tournaments t on t.tournament_id = m.tournament_id
join tennis.players w on w.player_id = m.winner_id
join tennis.players l on l.player_id = m.loser_id;

create view public.tennis_players with (security_invoker = true) as
select p.player_id, p.tour, p.name, p.slug,
  count(*) matches, count(*) filter (where s.won) wins,
  min(s.match_date) first_match, max(s.match_date) last_match
from tennis.players p
join (select winner_id pid, match_date, true won from tennis.matches
      union all select loser_id, match_date, false from tennis.matches) s on s.pid = p.player_id
group by p.player_id;

create view public.tennis_tournaments with (security_invoker = true) as
select t.tournament_id, t.tour, t.name, t.slug,
  min(m.year) first_year, max(m.year) last_year, count(*) matches
from tennis.tournaments t join tennis.matches m on m.tournament_id = t.tournament_id
group by t.tournament_id;

grant select on public.tennis_matches, public.tennis_players, public.tennis_tournaments to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Integrity checks, run daily by scripts/run_integrity_checks.py.
-- Freshness is a warning at 3 days and a failure at 7: the import runs on a
-- home PC, so a missed day or two is expected.
-- ---------------------------------------------------------------------------
create or replace function public.check_tennis_integrity()
returns table (check_name text, status text, found bigint, detail text)
language sql stable security definer set search_path = '' as $$
  select 'tennis_fresh',
    case when age_days is null then 'warning' when age_days >= 7 then 'failed' when age_days >= 3 then 'warning' else 'ok' end,
    coalesce(age_days, -1)::bigint,
    'Days since the last successful tennis_import run (runs on Chris''s PC; warns at 3, fails at 7; -1 = never run)'
  from (select extract(day from now() - max(finished_at))::int age_days
        from public.pipeline_runs where job_name = 'tennis_import' and status = 'success') x
  union all
  select 'tennis_sets_consistent', case when n = 0 then 'ok' else 'warning' end, n,
    'Completed tennis matches where sets won do not match the set scores (winner must take more sets)'
  from (select count(*) n from tennis.matches m
        where m.status = 'Completed' and m.w_sets is not null
          and (m.w_sets <= m.l_sets
               or m.w_sets <> (select count(*) from generate_subscripts(m.w_games, 1) i where m.w_games[i] > m.l_games[i])
               or m.l_sets <> (select count(*) from generate_subscripts(m.l_games, 1) i where m.l_games[i] > m.w_games[i]))) x
  union all
  select 'tennis_matches_mapped', case when n = 0 then 'ok' else 'failed' end, n,
    'Tennis matches missing from public.tennis_matches (unmapped player or tournament)'
  from (select (select count(*) from tennis.matches) - (select count(*) from public.tennis_matches) n) x
$$;
revoke all on function public.check_tennis_integrity() from public, anon, authenticated;
grant execute on function public.check_tennis_integrity() to service_role;

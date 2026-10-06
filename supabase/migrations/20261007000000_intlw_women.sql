-- ============================================================================
-- Women's international football (Chris, 6 Oct 2026: "continue with
-- recommendations" on adding the women's game).
--
-- The intlw schema is the men's intl schema, table for table and function for
-- function, so the same importer (scripts/intl_import.py --women), model and
-- squads job can fill it and the same pages can read it through public.intlw_*
-- views. Generated from the intl migrations below with intl -> intlw, so the
-- two stay in step; the integrity checks are left to the men's side.
--
--   20261005130000_intl_phase1.sql
--   20261005150000_intl_delete_where.sql
--   20261005170000_intl_summaries.sql
--   20261005190000_intl_continental.sql
--   20261005200000_intl_visuals.sql
--   20261005210000_intl_projections_squads.sql
--   20261005220000_intl_clubs.sql
--   20261006110000_intl_squad_snapshots.sql
--   20261006200000_intl_model_info_view.sql
--
-- Source: martj42/womens-international-results (same format as the men's file).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- from 20261005130000_intl_phase1.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- International football, phase 1 (data). Design: Claude Docs doc
-- "International football section — design" (5 Oct 2026).
--
-- An intl schema written only by service_role through the functions below
-- (scripts/intl_import.py, daily via intl-import.yml); anon-readable views in
-- public. Teams are keyed by the source's lineage name (martj42 files Soviet
-- Union games under Russia); intlw.team_names holds the name used at the time.
-- Match key: date|home|away, plus |2 for the one true duplicate in the source.
-- Every source row is kept whole in raw.
-- ============================================================================

create schema if not exists intlw;
grant usage on schema intlw to anon, authenticated, service_role;

create table intlw.teams (
  team text primary key,                    -- lineage name, as in the source
  slug text not null unique,
  confederation text check (confederation in ('UEFA', 'CONMEBOL', 'CONCACAF', 'CAF', 'AFC', 'OFC')),
  first_match date not null,
  last_match date not null,
  matches int not null
);

create table intlw.team_names (
  team text not null references intlw.teams(team) on delete cascade,
  name text not null,                       -- e.g. Dahomey for Benin
  valid_from date not null,
  valid_to date not null,
  primary key (team, name, valid_from)
);

create table intlw.competitions (
  name text primary key,                    -- source tournament name
  slug text not null unique,
  kind text not null check (kind in ('friendly', 'qualifying', 'nations_league', 'tournament')),
  confederation text,
  matches int not null
);

create table intlw.editions (
  edition_key text primary key,             -- WC-2026, EURO-2020, UNL-2026-27
  competition text not null references intlw.competitions(name),
  label text not null,                      -- 2026, 2020, 2026-27
  season_start int not null,
  teams int not null,
  matches int not null,
  hosts text[] not null default '{}',
  first_match date,
  last_match date,
  stage_source text not null,               -- openfootball / derived / hand groups / fixture feed
  unique (competition, label)
);

create table intlw.stages (
  stage_key text primary key,               -- edition|code
  edition_key text not null references intlw.editions(edition_key) on delete cascade,
  code text not null,                       -- GRP, R16, QF, SF, 3P, F, LP, PO_AB, ...
  name text not null,
  type text not null check (type in ('round_robin', 'knockout')),
  stage_order int not null,
  unique (edition_key, code)
);

create table intlw.groups (
  group_key text primary key,               -- edition|stage|label
  stage_key text not null references intlw.stages(stage_key) on delete cascade,
  label text not null,                      -- A, 1, A3
  league text,                              -- Nations League A-D
  size int not null
);

create table intlw.group_members (
  group_key text not null references intlw.groups(group_key) on delete cascade,
  team text not null references intlw.teams(team),
  primary key (group_key, team)
);

create table intlw.matches (
  match_key text primary key,
  match_date date not null,
  home_team text not null references intlw.teams(team),
  away_team text not null references intlw.teams(team),
  home_score int not null,                  -- final score, including extra time
  away_score int not null,
  competition text not null references intlw.competitions(name),
  city text,
  country text,
  neutral boolean not null,
  edition_key text references intlw.editions(edition_key),
  stage_code text,
  group_label text,
  matchday int,
  home_score_90 int,                        -- known for round robins, friendlies, and openfootball games
  away_score_90 int,
  went_extra_time boolean,                  -- null = not known
  shootout_winner text,
  elo_home_pre numeric,                     -- World Football Elo before the game (point in time)
  elo_away_pre numeric,
  elo_change numeric,                       -- home team's gain
  raw jsonb not null,
  imported_at timestamptz not null default now(),
  check (home_team <> away_team)
);
create index intl_matches_date_idx on intlw.matches (match_date);
create index intl_matches_home_idx on intlw.matches (home_team, match_date);
create index intl_matches_away_idx on intlw.matches (away_team, match_date);
create index intl_matches_edition_idx on intlw.matches (edition_key, stage_code);
create index intl_matches_competition_idx on intlw.matches (competition, match_date);

create table intlw.goals (
  match_key text not null references intlw.matches(match_key) on delete cascade,
  seq int not null,
  team text not null,
  scorer text,
  minute int,
  own_goal boolean not null,
  penalty boolean not null,
  primary key (match_key, seq)
);
create index intl_goals_scorer_idx on intlw.goals (team, scorer);

create table intlw.shootouts (
  match_key text primary key references intlw.matches(match_key) on delete cascade,
  winner text not null,
  first_shooter text
);

-- Upcoming games (the source of results has no fixtures). 2026/27 Nations
-- League from fixturedownload.com; joined to a result by date and teams.
create table intlw.fixtures (
  fixture_key text primary key,             -- edition|feed match number
  edition_key text not null,
  kickoff_utc timestamptz not null,
  home_team text not null references intlw.teams(team),
  away_team text not null references intlw.teams(team),
  group_label text,
  round_number int,
  venue text,
  home_score int,                           -- the feed's score, if it ever carries one
  away_score int,
  source text not null,
  raw jsonb not null,
  updated_at timestamptz not null default now()
);
create index intl_fixtures_kickoff_idx on intlw.fixtures (kickoff_utc);

-- UK TV rights, hand-kept (filled in phase 3).
create table intlw.broadcasters (
  competition text not null,
  team text,                                -- null = the whole competition
  from_year int not null,
  to_year int,
  uk_channel text not null,
  free_to_air boolean not null,
  notes text,
  source_url text,
  checked_on date not null,
  primary key (competition, from_year, uk_channel)
);

-- Rebuilt by intl_refresh() after every load.
create table intlw.team_competition_totals (
  team text not null,
  competition text not null,
  played int not null, won int not null, drawn int not null, lost int not null,
  goals_for int not null, goals_against int not null,
  first_match date not null, last_match date not null,
  primary key (team, competition)
);

create table intlw.pair_records (
  team_a text not null,                     -- team_a < team_b
  team_b text not null,
  played int not null, a_won int not null, drawn int not null, b_won int not null,
  a_goals int not null, b_goals int not null,
  first_meeting date not null, last_meeting date not null,
  primary key (team_a, team_b)
);
create index intl_pair_records_b_idx on intlw.pair_records (team_b);

do $$
declare t text;
begin
  foreach t in array array['teams', 'team_names', 'competitions', 'editions', 'stages', 'groups', 'group_members',
                           'matches', 'goals', 'shootouts', 'fixtures', 'broadcasters',
                           'team_competition_totals', 'pair_records'] loop
    execute format('alter table intlw.%I enable row level security', t);
    execute format('create policy "public read" on intlw.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
grant select on all tables in schema intlw to anon, authenticated;
grant all on all tables in schema intlw to service_role;

-- Name used at the time (Dahomey before 30 Nov 1975), else the lineage name.
create or replace function intlw.name_at(p_team text, p_date date)
returns text language sql stable set search_path = '' as $$
  select coalesce((select n.name from intlw.team_names n
                   where n.team = p_team and p_date between n.valid_from and n.valid_to
                   order by n.valid_from desc limit 1), p_team)
$$;
grant execute on function intlw.name_at(text, date) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Writers (service_role only).
-- ---------------------------------------------------------------------------

-- Small reference tables, synced whole: rows not in the payload are removed
-- (except editions and teams, which matches may still point at).
create or replace function public.intlw_load_reference(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into intlw.teams (team, slug, confederation, first_match, last_match, matches)
  select r->>'team', r->>'slug', r->>'confederation', (r->>'first_match')::date, (r->>'last_match')::date,
         (r->>'matches')::int
  from jsonb_array_elements(payload->'teams') r
  on conflict (team) do update set slug = excluded.slug, confederation = excluded.confederation,
    first_match = excluded.first_match, last_match = excluded.last_match, matches = excluded.matches;

  delete from intlw.team_names;
  insert into intlw.team_names (team, name, valid_from, valid_to)
  select r->>'team', r->>'name', (r->>'valid_from')::date, (r->>'valid_to')::date
  from jsonb_array_elements(payload->'team_names') r;

  insert into intlw.competitions (name, slug, kind, confederation, matches)
  select r->>'name', r->>'slug', r->>'kind', r->>'confederation', (r->>'matches')::int
  from jsonb_array_elements(payload->'competitions') r
  on conflict (name) do update set slug = excluded.slug, kind = excluded.kind,
    confederation = excluded.confederation, matches = excluded.matches;

  insert into intlw.editions (edition_key, competition, label, season_start, teams, matches, hosts,
                             first_match, last_match, stage_source)
  select r->>'edition_key', r->>'competition', r->>'label', (r->>'season_start')::int, (r->>'teams')::int,
         (r->>'matches')::int, array(select jsonb_array_elements_text(r->'hosts')),
         (r->>'first_match')::date, (r->>'last_match')::date, r->>'stage_source'
  from jsonb_array_elements(payload->'editions') r
  on conflict (edition_key) do update set competition = excluded.competition, label = excluded.label,
    season_start = excluded.season_start, teams = excluded.teams, matches = excluded.matches,
    hosts = excluded.hosts, first_match = excluded.first_match, last_match = excluded.last_match,
    stage_source = excluded.stage_source;

  insert into intlw.stages (stage_key, edition_key, code, name, type, stage_order)
  select r->>'stage_key', r->>'edition_key', r->>'code', r->>'name', r->>'type', (r->>'stage_order')::int
  from jsonb_array_elements(payload->'stages') r
  on conflict (stage_key) do update set name = excluded.name, type = excluded.type,
    stage_order = excluded.stage_order;
  delete from intlw.stages s
  where not exists (select 1 from jsonb_array_elements(payload->'stages') r where r->>'stage_key' = s.stage_key);

  insert into intlw.groups (group_key, stage_key, label, league, size)
  select r->>'group_key', r->>'stage_key', r->>'label', r->>'league', (r->>'size')::int
  from jsonb_array_elements(payload->'groups') r
  on conflict (group_key) do update set label = excluded.label, league = excluded.league, size = excluded.size;
  delete from intlw.groups g
  where not exists (select 1 from jsonb_array_elements(payload->'groups') r where r->>'group_key' = g.group_key);

  delete from intlw.group_members;
  insert into intlw.group_members (group_key, team)
  select r->>'group_key', r->>'team' from jsonb_array_elements(payload->'group_members') r;
end $$;

create or replace function public.intlw_upsert_matches(rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into intlw.matches as m (match_key, match_date, home_team, away_team, home_score, away_score, competition,
    city, country, neutral, edition_key, stage_code, group_label, matchday, home_score_90, away_score_90,
    went_extra_time, shootout_winner, elo_home_pre, elo_away_pre, elo_change, raw, imported_at)
  select r->>'match_key', (r->>'match_date')::date, r->>'home_team', r->>'away_team',
    (r->>'home_score')::int, (r->>'away_score')::int, r->>'competition', r->>'city', r->>'country',
    (r->>'neutral')::boolean, r->>'edition_key', r->>'stage_code', r->>'group_label', (r->>'matchday')::int,
    (r->>'home_score_90')::int, (r->>'away_score_90')::int, (r->>'went_extra_time')::boolean,
    r->>'shootout_winner', (r->>'elo_home_pre')::numeric, (r->>'elo_away_pre')::numeric,
    (r->>'elo_change')::numeric, r->'raw', now()
  from jsonb_array_elements(rows) r
  on conflict (match_key) do update set
    match_date = excluded.match_date, home_team = excluded.home_team, away_team = excluded.away_team,
    home_score = excluded.home_score, away_score = excluded.away_score, competition = excluded.competition,
    city = excluded.city, country = excluded.country, neutral = excluded.neutral,
    edition_key = excluded.edition_key, stage_code = excluded.stage_code, group_label = excluded.group_label,
    matchday = excluded.matchday, home_score_90 = excluded.home_score_90, away_score_90 = excluded.away_score_90,
    went_extra_time = excluded.went_extra_time, shootout_winner = excluded.shootout_winner,
    elo_home_pre = excluded.elo_home_pre, elo_away_pre = excluded.elo_away_pre, elo_change = excluded.elo_change,
    raw = excluded.raw, imported_at = now()
  where m.raw is distinct from excluded.raw or m.edition_key is distinct from excluded.edition_key
     or m.stage_code is distinct from excluded.stage_code or m.group_label is distinct from excluded.group_label
     or m.home_score_90 is distinct from excluded.home_score_90 or m.elo_change is distinct from excluded.elo_change
     or m.elo_home_pre is distinct from excluded.elo_home_pre or m.shootout_winner is distinct from excluded.shootout_winner;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.intlw_replace_goals(rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intlw.goals g
  where g.match_key in (select distinct r->>'match_key' from jsonb_array_elements(rows) r);
  insert into intlw.goals (match_key, seq, team, scorer, minute, own_goal, penalty)
  select r->>'match_key', (r->>'seq')::int, r->>'team', r->>'scorer', (r->>'minute')::int,
         (r->>'own_goal')::boolean, (r->>'penalty')::boolean
  from jsonb_array_elements(rows) r;
end $$;

create or replace function public.intlw_replace_shootouts(rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intlw.shootouts;
  insert into intlw.shootouts (match_key, winner, first_shooter)
  select r->>'match_key', r->>'winner', r->>'first_shooter' from jsonb_array_elements(rows) r;
end $$;

create or replace function public.intlw_upsert_fixtures(rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into intlw.fixtures as f (fixture_key, edition_key, kickoff_utc, home_team, away_team, group_label,
    round_number, venue, home_score, away_score, source, raw, updated_at)
  select r->>'fixture_key', r->>'edition_key', (r->>'kickoff_utc')::timestamptz, r->>'home_team', r->>'away_team',
    r->>'group_label', (r->>'round_number')::int, r->>'venue', (r->>'home_score')::int, (r->>'away_score')::int,
    r->>'source', r->'raw', now()
  from jsonb_array_elements(rows) r
  on conflict (fixture_key) do update set kickoff_utc = excluded.kickoff_utc, home_team = excluded.home_team,
    away_team = excluded.away_team, group_label = excluded.group_label, round_number = excluded.round_number,
    venue = excluded.venue,
    -- never let the feed blank a score it once carried
    home_score = coalesce(excluded.home_score, f.home_score), away_score = coalesce(excluded.away_score, f.away_score),
    raw = excluded.raw, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Reconciliation: same (matches, goals, key hash) per year as
-- intl_import.year_totals(). collate "C" sorts by code point, as Python does.
create or replace function public.intlw_year_totals()
returns table (year int, matches bigint, goals bigint, key_hash text)
language sql stable security definer set search_path = '' as $$
  select extract(year from match_date)::int, count(*), sum(home_score + away_score),
         md5(string_agg(match_key, E'\n' order by match_key collate "C"))
  from intlw.matches group by 1 order by 1
$$;

create or replace function public.intlw_match_keys(p_year int)
returns setof text language sql stable security definer set search_path = '' as $$
  select match_key from intlw.matches where extract(year from match_date) = p_year
$$;

create or replace function public.intlw_delete_matches(keys jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from intlw.matches where match_key in (select jsonb_array_elements_text(keys));
  get diagnostics n = row_count;
  return n;
end $$;

-- Aggregates the pages read. Wins and losses are by the final score;
-- a shoot-out counts as a draw.
create or replace function public.intlw_refresh()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intlw.team_competition_totals;
  insert into intlw.team_competition_totals
  select team, competition, count(*), count(*) filter (where gf > ga), count(*) filter (where gf = ga),
         count(*) filter (where gf < ga), sum(gf), sum(ga), min(match_date), max(match_date)
  from (select home_team team, competition, home_score gf, away_score ga, match_date from intlw.matches
        union all
        select away_team, competition, away_score, home_score, match_date from intlw.matches) s
  group by team, competition;

  delete from intlw.pair_records;
  insert into intlw.pair_records
  select a, b, count(*), count(*) filter (where ag > bg), count(*) filter (where ag = bg),
         count(*) filter (where ag < bg), sum(ag), sum(bg), min(match_date), max(match_date)
  from (select least(home_team, away_team) a, greatest(home_team, away_team) b,
               case when home_team < away_team then home_score else away_score end ag,
               case when home_team < away_team then away_score else home_score end bg, match_date
        from intlw.matches) s
  group by a, b;
end $$;

do $$
declare f text;
begin
  foreach f in array array['intlw_load_reference(jsonb)', 'intlw_upsert_matches(jsonb)', 'intlw_replace_goals(jsonb)',
                           'intlw_replace_shootouts(jsonb)', 'intlw_upsert_fixtures(jsonb)', 'intlw_year_totals()',
                           'intlw_match_keys(int)', 'intlw_delete_matches(jsonb)', 'intlw_refresh()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Public read views.
-- ---------------------------------------------------------------------------

create view public.intlw_teams with (security_invoker = true) as
select team, slug, confederation, first_match, last_match, matches,
       confederation is not null as is_confederation_member
from intlw.teams;

create view public.intlw_team_names with (security_invoker = true) as
select team, name, valid_from, valid_to from intlw.team_names;

create view public.intlw_competitions with (security_invoker = true) as
select name, slug, kind, confederation, matches from intlw.competitions;

create view public.intlw_editions with (security_invoker = true) as
select e.edition_key, e.competition, c.slug as competition_slug, e.label, e.season_start, e.teams, e.matches,
       e.hosts, e.first_match, e.last_match, e.stage_source
from intlw.editions e join intlw.competitions c on c.name = e.competition;

create view public.intlw_stages with (security_invoker = true) as
select stage_key, edition_key, code, name, type, stage_order from intlw.stages;

create view public.intlw_groups with (security_invoker = true) as
select g.group_key, s.edition_key, s.code as stage_code, g.label, g.league, g.size,
       array(select gm.team from intlw.group_members gm where gm.group_key = g.group_key order by gm.team) as teams
from intlw.groups g join intlw.stages s on s.stage_key = g.stage_key;

create view public.intlw_matches with (security_invoker = true) as
select m.match_key, m.match_date, m.home_team, ht.slug as home_slug, intlw.name_at(m.home_team, m.match_date) as home_name,
       m.away_team, awt.slug as away_slug, intlw.name_at(m.away_team, m.match_date) as away_name,
       m.home_score, m.away_score, m.home_score_90, m.away_score_90, m.went_extra_time, m.shootout_winner,
       m.competition, c.slug as competition_slug, c.kind as competition_kind,
       m.edition_key, m.stage_code, s.name as stage_name, s.type as stage_type, m.group_label, m.matchday,
       m.city, m.country, m.neutral, m.elo_home_pre, m.elo_away_pre, m.elo_change
from intlw.matches m
join intlw.teams ht on ht.team = m.home_team
join intlw.teams awt on awt.team = m.away_team
join intlw.competitions c on c.name = m.competition
left join intlw.stages s on s.edition_key = m.edition_key and s.code = m.stage_code;

-- Fixtures with their result once the results file has it (same UK date,
-- same teams); until then the page shows "Result to follow".
create view public.intlw_fixtures with (security_invoker = true) as
select f.fixture_key, f.edition_key, f.kickoff_utc, f.home_team, ht.slug as home_slug, f.away_team,
       awt.slug as away_slug, f.group_label, f.round_number, f.venue,
       coalesce(m.home_score, f.home_score) as home_score, coalesce(m.away_score, f.away_score) as away_score,
       m.match_key
from intlw.fixtures f
join intlw.teams ht on ht.team = f.home_team
join intlw.teams awt on awt.team = f.away_team
left join intlw.matches m on m.home_team = f.home_team and m.away_team = f.away_team
  and m.match_date between (f.kickoff_utc at time zone 'Europe/London')::date - 1
                       and (f.kickoff_utc at time zone 'Europe/London')::date + 1;

create view public.intlw_team_competition_totals with (security_invoker = true) as
select t.team, t.competition, c.kind as competition_kind, t.played, t.won, t.drawn, t.lost,
       t.goals_for, t.goals_against, t.first_match, t.last_match
from intlw.team_competition_totals t join intlw.competitions c on c.name = t.competition;

create view public.intlw_pair_records with (security_invoker = true) as
select team_a, team_b, played, a_won, drawn, b_won, a_goals, b_goals, first_meeting, last_meeting
from intlw.pair_records;

create view public.intlw_goals with (security_invoker = true) as
select match_key, seq, team, scorer, minute, own_goal, penalty from intlw.goals;

grant select on public.intlw_teams, public.intlw_team_names, public.intlw_competitions, public.intlw_editions,
  public.intlw_stages, public.intlw_groups, public.intlw_matches, public.intlw_fixtures,
  public.intlw_team_competition_totals, public.intlw_pair_records, public.intlw_goals to anon, authenticated;


-- ---------------------------------------------------------------------------
-- from 20261005150000_intl_delete_where.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- International import fix (5 Oct 2026). Supabase's pg_safeupdate guard
-- refuses a DELETE without a WHERE clause when it arrives through the API, so
-- the first intl_import run failed in intl_load_reference with "DELETE requires
-- a WHERE clause" (the local Postgres used for testing has no such guard).
-- The full-table clears now say "where true". Bodies otherwise unchanged.
-- ============================================================================

create or replace function public.intlw_load_reference(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into intlw.teams (team, slug, confederation, first_match, last_match, matches)
  select r->>'team', r->>'slug', r->>'confederation', (r->>'first_match')::date, (r->>'last_match')::date,
         (r->>'matches')::int
  from jsonb_array_elements(payload->'teams') r
  on conflict (team) do update set slug = excluded.slug, confederation = excluded.confederation,
    first_match = excluded.first_match, last_match = excluded.last_match, matches = excluded.matches;

  delete from intlw.team_names where true;
  insert into intlw.team_names (team, name, valid_from, valid_to)
  select r->>'team', r->>'name', (r->>'valid_from')::date, (r->>'valid_to')::date
  from jsonb_array_elements(payload->'team_names') r;

  insert into intlw.competitions (name, slug, kind, confederation, matches)
  select r->>'name', r->>'slug', r->>'kind', r->>'confederation', (r->>'matches')::int
  from jsonb_array_elements(payload->'competitions') r
  on conflict (name) do update set slug = excluded.slug, kind = excluded.kind,
    confederation = excluded.confederation, matches = excluded.matches;

  insert into intlw.editions (edition_key, competition, label, season_start, teams, matches, hosts,
                             first_match, last_match, stage_source)
  select r->>'edition_key', r->>'competition', r->>'label', (r->>'season_start')::int, (r->>'teams')::int,
         (r->>'matches')::int, array(select jsonb_array_elements_text(r->'hosts')),
         (r->>'first_match')::date, (r->>'last_match')::date, r->>'stage_source'
  from jsonb_array_elements(payload->'editions') r
  on conflict (edition_key) do update set competition = excluded.competition, label = excluded.label,
    season_start = excluded.season_start, teams = excluded.teams, matches = excluded.matches,
    hosts = excluded.hosts, first_match = excluded.first_match, last_match = excluded.last_match,
    stage_source = excluded.stage_source;

  insert into intlw.stages (stage_key, edition_key, code, name, type, stage_order)
  select r->>'stage_key', r->>'edition_key', r->>'code', r->>'name', r->>'type', (r->>'stage_order')::int
  from jsonb_array_elements(payload->'stages') r
  on conflict (stage_key) do update set name = excluded.name, type = excluded.type,
    stage_order = excluded.stage_order;
  delete from intlw.stages s
  where not exists (select 1 from jsonb_array_elements(payload->'stages') r where r->>'stage_key' = s.stage_key);

  insert into intlw.groups (group_key, stage_key, label, league, size)
  select r->>'group_key', r->>'stage_key', r->>'label', r->>'league', (r->>'size')::int
  from jsonb_array_elements(payload->'groups') r
  on conflict (group_key) do update set label = excluded.label, league = excluded.league, size = excluded.size;
  delete from intlw.groups g
  where not exists (select 1 from jsonb_array_elements(payload->'groups') r where r->>'group_key' = g.group_key);

  delete from intlw.group_members where true;
  insert into intlw.group_members (group_key, team)
  select r->>'group_key', r->>'team' from jsonb_array_elements(payload->'group_members') r;
end $$;

create or replace function public.intlw_replace_shootouts(rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intlw.shootouts where true;
  insert into intlw.shootouts (match_key, winner, first_shooter)
  select r->>'match_key', r->>'winner', r->>'first_shooter' from jsonb_array_elements(rows) r;
end $$;

create or replace function public.intlw_refresh()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intlw.team_competition_totals where true;
  insert into intlw.team_competition_totals
  select team, competition, count(*), count(*) filter (where gf > ga), count(*) filter (where gf = ga),
         count(*) filter (where gf < ga), sum(gf), sum(ga), min(match_date), max(match_date)
  from (select home_team team, competition, home_score gf, away_score ga, match_date from intlw.matches
        union all
        select away_team, competition, away_score, home_score, match_date from intlw.matches) s
  group by team, competition;

  delete from intlw.pair_records where true;
  insert into intlw.pair_records
  select a, b, count(*), count(*) filter (where ag > bg), count(*) filter (where ag = bg),
         count(*) filter (where ag < bg), sum(ag), sum(bg), min(match_date), max(match_date)
  from (select least(home_team, away_team) a, greatest(home_team, away_team) b,
               case when home_team < away_team then home_score else away_score end ag,
               case when home_team < away_team then away_score else home_score end bg, match_date
        from intlw.matches) s
  group by a, b;
end $$;

-- ---------------------------------------------------------------------------
-- from 20261005170000_intl_summaries.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- International pages (phase 2): summary tables the pages read, rebuilt by
-- intl_refresh() after every import.
--
-- intlw.team_summary     one row per team: record, current and peak World
--                       Football Elo, Elo rank among current FIFA sides,
--                       World Cup / Euro / Nations League titles.
-- intlw.edition_summary  one row per edition: winner, runner-up, the final,
--                       games and goals.
--
-- Winners: the last game of the Final stage (so a replayed final counts the
-- replay), by score, then shoot-out. The 1950 World Cup had a final group
-- instead of a final: its winner tops that group (2 points a win, then goal
-- difference).
-- ============================================================================

create table intlw.team_summary (
  team text primary key,
  slug text not null,
  confederation text,
  played int not null, won int not null, drawn int not null, lost int not null,
  goals_for int not null, goals_against int not null,
  first_match date not null, last_match date not null,
  elo numeric not null,                     -- after the team's latest game
  elo_rank int,                             -- among confederation members who played in the last 4 years
  elo_peak numeric not null,
  elo_peak_date date not null,
  wc_titles int not null default 0,
  euro_titles int not null default 0,
  unl_titles int not null default 0
);

create table intlw.edition_summary (
  edition_key text primary key,
  competition text not null,
  label text not null,
  season_start int not null,
  teams int not null,
  matches int not null,
  goals int not null,
  hosts text[] not null default '{}',
  winner text,
  runner_up text,
  final_key text,                           -- the deciding game (null for a final group)
  first_match date,
  last_match date
);

alter table intlw.team_summary enable row level security;
alter table intlw.edition_summary enable row level security;
create policy "public read" on intlw.team_summary for select to anon, authenticated using (true);
create policy "public read" on intlw.edition_summary for select to anon, authenticated using (true);
grant select on intlw.team_summary, intlw.edition_summary to anon, authenticated;
grant all on intlw.team_summary, intlw.edition_summary to service_role;

create or replace function public.intlw_refresh()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intlw.team_competition_totals where true;
  insert into intlw.team_competition_totals
  select team, competition, count(*), count(*) filter (where gf > ga), count(*) filter (where gf = ga),
         count(*) filter (where gf < ga), sum(gf), sum(ga), min(match_date), max(match_date)
  from (select home_team team, competition, home_score gf, away_score ga, match_date from intlw.matches
        union all
        select away_team, competition, away_score, home_score, match_date from intlw.matches) s
  group by team, competition;

  delete from intlw.pair_records where true;
  insert into intlw.pair_records
  select a, b, count(*), count(*) filter (where ag > bg), count(*) filter (where ag = bg),
         count(*) filter (where ag < bg), sum(ag), sum(bg), min(match_date), max(match_date)
  from (select least(home_team, away_team) a, greatest(home_team, away_team) b,
               case when home_team < away_team then home_score else away_score end ag,
               case when home_team < away_team then away_score else home_score end bg, match_date
        from intlw.matches) s
  group by a, b;

  -- Editions: winner and runner-up.
  delete from intlw.edition_summary where true;
  insert into intlw.edition_summary (edition_key, competition, label, season_start, teams, matches, goals, hosts,
                                    winner, runner_up, final_key, first_match, last_match)
  with fin as (
    select distinct on (m.edition_key) m.edition_key, m.match_key,
      case when m.home_score > m.away_score then m.home_team when m.away_score > m.home_score then m.away_team
           else m.shootout_winner end as winner,
      case when m.home_score > m.away_score then m.away_team when m.away_score > m.home_score then m.home_team
           when m.shootout_winner = m.home_team then m.away_team when m.shootout_winner = m.away_team then m.home_team end as runner_up
    from intlw.matches m where m.stage_code = 'F'
    order by m.edition_key, m.match_date desc, m.match_key desc
  ),
  fr as (  -- final group (World Cup 1950): 2 points a win, then goal difference
    select edition_key, team, row_number() over (partition by edition_key order by sum(pts) desc, sum(gf - ga) desc) as pos
    from (select edition_key, home_team team, home_score gf, away_score ga,
                 case when home_score > away_score then 2 when home_score = away_score then 1 else 0 end pts
          from intlw.matches where stage_code = 'FR'
          union all
          select edition_key, away_team, away_score, home_score,
                 case when away_score > home_score then 2 when home_score = away_score then 1 else 0 end
          from intlw.matches where stage_code = 'FR') s
    group by edition_key, team
  ),
  totals as (
    select edition_key, count(*) n, sum(home_score + away_score) g from intlw.matches where edition_key is not null group by 1
  )
  select e.edition_key, e.competition, e.label, e.season_start, e.teams, coalesce(t.n, 0), coalesce(t.g, 0), e.hosts,
         coalesce(fin.winner, (select team from fr where fr.edition_key = e.edition_key and pos = 1)),
         coalesce(fin.runner_up, (select team from fr where fr.edition_key = e.edition_key and pos = 2)),
         fin.match_key, e.first_match, e.last_match
  from intlw.editions e
  left join fin on fin.edition_key = e.edition_key
  left join totals t on t.edition_key = e.edition_key;

  -- Teams: record, Elo now and at its peak, titles.
  delete from intlw.team_summary where true;
  insert into intlw.team_summary
  with sides as (
    select home_team team, match_date d, match_key k, elo_home_pre + elo_change after from intlw.matches
    union all
    select away_team, match_date, match_key, elo_away_pre - elo_change from intlw.matches
  ),
  latest as (select distinct on (team) team, after from sides order by team, d desc, k desc),
  peak as (select distinct on (team) team, after, d from sides order by team, after desc, d asc),
  rec as (
    select team, sum(played) p, sum(won) w, sum(drawn) dr, sum(lost) l, sum(goals_for) gf, sum(goals_against) ga
    from intlw.team_competition_totals group by team
  ),
  titles as (
    select winner team,
           count(*) filter (where competition = 'FIFA World Cup') wc,
           count(*) filter (where competition = 'UEFA Euro') eu,
           count(*) filter (where competition = 'UEFA Nations League') nl
    from intlw.edition_summary where winner is not null group by winner
  )
  select t.team, t.slug, t.confederation, rec.p, rec.w, rec.dr, rec.l, rec.gf, rec.ga, t.first_match, t.last_match,
         round(latest.after, 1),
         case when t.confederation is not null and t.last_match >= current_date - interval '4 years'
              then rank() over (partition by (t.confederation is not null and t.last_match >= current_date - interval '4 years')
                                order by latest.after desc) end,
         round(peak.after, 1), peak.d,
         coalesce(titles.wc, 0), coalesce(titles.eu, 0), coalesce(titles.nl, 0)
  from intlw.teams t
  join rec on rec.team = t.team
  join latest on latest.team = t.team
  join peak on peak.team = t.team
  left join titles on titles.team = t.team;
end $$;

revoke all on function public.intlw_refresh() from public, anon, authenticated;
grant execute on function public.intlw_refresh() to service_role;

create view public.intlw_team_summary with (security_invoker = true) as
select team, slug, confederation, played, won, drawn, lost, goals_for, goals_against, first_match, last_match,
       elo, elo_rank, elo_peak, elo_peak_date, wc_titles, euro_titles, unl_titles
from intlw.team_summary;

create view public.intlw_edition_summary with (security_invoker = true) as
select s.edition_key, s.competition, c.slug as competition_slug, s.label, s.season_start, s.teams, s.matches, s.goals,
       s.hosts, s.winner, w.slug as winner_slug, s.runner_up, r.slug as runner_up_slug, s.final_key, s.first_match, s.last_match
from intlw.edition_summary s
join intlw.competitions c on c.name = s.competition
left join intlw.teams w on w.team = s.winner
left join intlw.teams r on r.team = s.runner_up;

grant select on public.intlw_team_summary, public.intlw_edition_summary to anon, authenticated;

-- Fill the new tables now; the import that follows this migration refreshes them again.
select public.intlw_refresh();

-- ---------------------------------------------------------------------------
-- from 20261005190000_intl_continental.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- International: continental tournaments (5 Oct 2026).
--
-- The importer now builds editions for the Copa América, Africa Cup of
-- Nations, AFC Asian Cup, Gold Cup and Confederations Cup as well as the World
-- Cup, Euro and Nations League. Their rounds are derived from the results, and
-- a few early editions (decided by play-offs or final groups the results file
-- does not mark) carry a winner the importer states. So:
--
--   intlw.editions.winner / runner_up   set by the importer when it knows them
--   intlw.edition_summary               uses them first, then the final, then
--                                      a final group
--   intlw.team_summary.titles           {competition slug: titles} for every
--                                      tournament and the Nations League
-- ============================================================================

alter table intlw.editions add column if not exists winner text references intlw.teams(team);
alter table intlw.editions add column if not exists runner_up text references intlw.teams(team);
alter table intlw.team_summary add column if not exists titles jsonb not null default '{}';

create or replace function public.intlw_load_reference(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into intlw.teams (team, slug, confederation, first_match, last_match, matches)
  select r->>'team', r->>'slug', r->>'confederation', (r->>'first_match')::date, (r->>'last_match')::date,
         (r->>'matches')::int
  from jsonb_array_elements(payload->'teams') r
  on conflict (team) do update set slug = excluded.slug, confederation = excluded.confederation,
    first_match = excluded.first_match, last_match = excluded.last_match, matches = excluded.matches;

  delete from intlw.team_names where true;
  insert into intlw.team_names (team, name, valid_from, valid_to)
  select r->>'team', r->>'name', (r->>'valid_from')::date, (r->>'valid_to')::date
  from jsonb_array_elements(payload->'team_names') r;

  insert into intlw.competitions (name, slug, kind, confederation, matches)
  select r->>'name', r->>'slug', r->>'kind', r->>'confederation', (r->>'matches')::int
  from jsonb_array_elements(payload->'competitions') r
  on conflict (name) do update set slug = excluded.slug, kind = excluded.kind,
    confederation = excluded.confederation, matches = excluded.matches;

  insert into intlw.editions (edition_key, competition, label, season_start, teams, matches, hosts,
                             first_match, last_match, stage_source, winner, runner_up)
  select r->>'edition_key', r->>'competition', r->>'label', (r->>'season_start')::int, (r->>'teams')::int,
         (r->>'matches')::int, array(select jsonb_array_elements_text(r->'hosts')),
         (r->>'first_match')::date, (r->>'last_match')::date, r->>'stage_source',
         r->>'winner', r->>'runner_up'
  from jsonb_array_elements(payload->'editions') r
  on conflict (edition_key) do update set competition = excluded.competition, label = excluded.label,
    season_start = excluded.season_start, teams = excluded.teams, matches = excluded.matches,
    hosts = excluded.hosts, first_match = excluded.first_match, last_match = excluded.last_match,
    stage_source = excluded.stage_source, winner = excluded.winner, runner_up = excluded.runner_up;

  insert into intlw.stages (stage_key, edition_key, code, name, type, stage_order)
  select r->>'stage_key', r->>'edition_key', r->>'code', r->>'name', r->>'type', (r->>'stage_order')::int
  from jsonb_array_elements(payload->'stages') r
  on conflict (stage_key) do update set name = excluded.name, type = excluded.type,
    stage_order = excluded.stage_order;
  delete from intlw.stages s
  where not exists (select 1 from jsonb_array_elements(payload->'stages') r where r->>'stage_key' = s.stage_key);

  insert into intlw.groups (group_key, stage_key, label, league, size)
  select r->>'group_key', r->>'stage_key', r->>'label', r->>'league', (r->>'size')::int
  from jsonb_array_elements(payload->'groups') r
  on conflict (group_key) do update set label = excluded.label, league = excluded.league, size = excluded.size;
  delete from intlw.groups g
  where not exists (select 1 from jsonb_array_elements(payload->'groups') r where r->>'group_key' = g.group_key);

  delete from intlw.group_members where true;
  insert into intlw.group_members (group_key, team)
  select r->>'group_key', r->>'team' from jsonb_array_elements(payload->'group_members') r;
end $$;

create or replace function public.intlw_refresh()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intlw.team_competition_totals where true;
  insert into intlw.team_competition_totals
  select team, competition, count(*), count(*) filter (where gf > ga), count(*) filter (where gf = ga),
         count(*) filter (where gf < ga), sum(gf), sum(ga), min(match_date), max(match_date)
  from (select home_team team, competition, home_score gf, away_score ga, match_date from intlw.matches
        union all
        select away_team, competition, away_score, home_score, match_date from intlw.matches) s
  group by team, competition;

  delete from intlw.pair_records where true;
  insert into intlw.pair_records
  select a, b, count(*), count(*) filter (where ag > bg), count(*) filter (where ag = bg),
         count(*) filter (where ag < bg), sum(ag), sum(bg), min(match_date), max(match_date)
  from (select least(home_team, away_team) a, greatest(home_team, away_team) b,
               case when home_team < away_team then home_score else away_score end ag,
               case when home_team < away_team then away_score else home_score end bg, match_date
        from intlw.matches) s
  group by a, b;

  -- Editions: winner and runner-up.
  delete from intlw.edition_summary where true;
  insert into intlw.edition_summary (edition_key, competition, label, season_start, teams, matches, goals, hosts,
                                    winner, runner_up, final_key, first_match, last_match)
  with fin as (
    select distinct on (m.edition_key) m.edition_key, m.match_key,
      case when m.home_score > m.away_score then m.home_team when m.away_score > m.home_score then m.away_team
           else m.shootout_winner end as winner,
      case when m.home_score > m.away_score then m.away_team when m.away_score > m.home_score then m.home_team
           when m.shootout_winner = m.home_team then m.away_team when m.shootout_winner = m.away_team then m.home_team end as runner_up
    from intlw.matches m where m.stage_code = 'F'
    order by m.edition_key, m.match_date desc, m.match_key desc
  ),
  fr as (  -- final group (World Cup 1950): 2 points a win, then goal difference
    select edition_key, team, row_number() over (partition by edition_key order by sum(pts) desc, sum(gf - ga) desc) as pos
    from (select edition_key, home_team team, home_score gf, away_score ga,
                 case when home_score > away_score then 2 when home_score = away_score then 1 else 0 end pts
          from intlw.matches where stage_code = 'FR'
          union all
          select edition_key, away_team, away_score, home_score,
                 case when away_score > home_score then 2 when home_score = away_score then 1 else 0 end
          from intlw.matches where stage_code = 'FR') s
    group by edition_key, team
  ),
  totals as (
    select edition_key, count(*) n, sum(home_score + away_score) g from intlw.matches where edition_key is not null group by 1
  )
  select e.edition_key, e.competition, e.label, e.season_start, e.teams, coalesce(t.n, 0), coalesce(t.g, 0), e.hosts,
         coalesce(e.winner, fin.winner, (select team from fr where fr.edition_key = e.edition_key and pos = 1)),
         coalesce(e.runner_up, fin.runner_up, (select team from fr where fr.edition_key = e.edition_key and pos = 2)),
         fin.match_key, e.first_match, e.last_match
  from intlw.editions e
  left join fin on fin.edition_key = e.edition_key
  left join totals t on t.edition_key = e.edition_key;

  -- Teams: record, Elo now and at its peak, titles.
  delete from intlw.team_summary where true;
  insert into intlw.team_summary
  with sides as (
    select home_team team, match_date d, match_key k, elo_home_pre + elo_change after from intlw.matches
    union all
    select away_team, match_date, match_key, elo_away_pre - elo_change from intlw.matches
  ),
  latest as (select distinct on (team) team, after from sides order by team, d desc, k desc),
  peak as (select distinct on (team) team, after, d from sides order by team, after desc, d asc),
  rec as (
    select team, sum(played) p, sum(won) w, sum(drawn) dr, sum(lost) l, sum(goals_for) gf, sum(goals_against) ga
    from intlw.team_competition_totals group by team
  ),
  titles as (  -- one row per edition won
    select winner team,
           coalesce(sum(n) filter (where competition = 'FIFA World Cup'), 0) wc,
           coalesce(sum(n) filter (where competition = 'UEFA Euro'), 0) eu,
           coalesce(sum(n) filter (where competition = 'UEFA Nations League'), 0) nl,
           jsonb_object_agg(slug, n) titles
    from (select s.winner, s.competition, c.slug, count(*) n
          from intlw.edition_summary s join intlw.competitions c on c.name = s.competition
          where s.winner is not null group by 1, 2, 3) x
    group by winner
  )
  select t.team, t.slug, t.confederation, rec.p, rec.w, rec.dr, rec.l, rec.gf, rec.ga, t.first_match, t.last_match,
         round(latest.after, 1),
         case when t.confederation is not null and t.last_match >= current_date - interval '4 years'
              then rank() over (partition by (t.confederation is not null and t.last_match >= current_date - interval '4 years')
                                order by latest.after desc) end,
         round(peak.after, 1), peak.d,
         coalesce(titles.wc, 0), coalesce(titles.eu, 0), coalesce(titles.nl, 0), coalesce(titles.titles, '{}')
  from intlw.teams t
  join rec on rec.team = t.team
  join latest on latest.team = t.team
  join peak on peak.team = t.team
  left join titles on titles.team = t.team;
end $$;

revoke all on function public.intlw_load_reference(jsonb) from public, anon, authenticated;
grant execute on function public.intlw_load_reference(jsonb) to service_role;
revoke all on function public.intlw_refresh() from public, anon, authenticated;
grant execute on function public.intlw_refresh() to service_role;

create or replace view public.intlw_team_summary with (security_invoker = true) as
select team, slug, confederation, played, won, drawn, lost, goals_for, goals_against, first_match, last_match,
       elo, elo_rank, elo_peak, elo_peak_date, wc_titles, euro_titles, unl_titles, titles
from intlw.team_summary;

grant select on public.intlw_team_summary to anon, authenticated;

-- ---------------------------------------------------------------------------
-- from 20261005200000_intl_visuals.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- International: data for the history visuals (5 Oct 2026).
--
-- intlw.team_year_elo  each nation's World Football Elo at the end of every
--                     year it was active (a game in that year or the three
--                     before), with its rank that year among confederation
--                     members. Feeds the "Elo race since 1872".
-- intlw.upsets         every competitive game (not a friendly) won by the side
--                     the Elo ratings gave less than a 25% expectation, with
--                     that expectation. Feeds the biggest-upsets lists.
--
-- Both are rebuilt by public.intlw_refresh_visuals(), which the importer calls
-- straight after intl_refresh().
-- ============================================================================

create table intlw.team_year_elo (
  team text not null references intlw.teams(team) on delete cascade,
  year int not null,
  elo numeric not null,                     -- after the team's last game up to the end of the year
  rank int not null,                        -- among active confederation members that year
  played int not null,                      -- games in the year
  primary key (team, year)
);
create index intl_team_year_elo_rank_idx on intlw.team_year_elo (rank, year);

create table intlw.upsets (
  match_key text primary key references intlw.matches(match_key) on delete cascade,
  winner text not null,
  loser text not null,
  expectation numeric not null,             -- the winner's Elo expectation before the game (0-1)
  kind text not null                        -- competition kind: tournament / qualifying / nations_league
);
create index intl_upsets_expectation_idx on intlw.upsets (expectation);

alter table intlw.team_year_elo enable row level security;
alter table intlw.upsets enable row level security;
create policy "public read" on intlw.team_year_elo for select to anon, authenticated using (true);
create policy "public read" on intlw.upsets for select to anon, authenticated using (true);
grant select on intlw.team_year_elo, intlw.upsets to anon, authenticated;
grant all on intlw.team_year_elo, intlw.upsets to service_role;

create or replace function public.intlw_refresh_visuals()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intlw.team_year_elo where true;
  insert into intlw.team_year_elo (team, year, elo, rank, played)
  with sides as (
    select home_team team, match_date d, match_key k, elo_home_pre + elo_change after from intlw.matches
    union all
    select away_team, match_date, match_key, elo_away_pre - elo_change from intlw.matches
  ),
  year_end as (   -- last rating in each year a team played
    select distinct on (team, y) team, extract(year from d)::int y, after,
           count(*) over (partition by team, extract(year from d)::int) n
    from sides order by team, y, d desc, k desc
  ),
  span as (       -- every year from a team's first game to its last
    select t.team, y
    from intlw.teams t
    cross join lateral generate_series(extract(year from t.first_match)::int, extract(year from t.last_match)::int) y
    where t.confederation is not null
  ),
  filled as (
    select s.team, s.y, ye.after, coalesce(ye.n, 0) n,
           count(ye.after) over (partition by s.team order by s.y) grp,
           max(case when ye.after is not null then s.y end) over (partition by s.team order by s.y) last_played
    from span s left join year_end ye on ye.team = s.team and ye.y = s.y
  ),
  carried as (
    select team, y, n, last_played,
           first_value(after) over (partition by team, grp order by y) elo
    from filled
  )
  select team, y, round(elo, 1), rank() over (partition by y order by elo desc), n
  from carried
  where elo is not null and last_played >= y - 3;

  delete from intlw.upsets where true;
  insert into intlw.upsets (match_key, winner, loser, expectation, kind)
  select match_key,
         case when home_score > away_score then home_team else away_team end,
         case when home_score > away_score then away_team else home_team end,
         round(case when home_score > away_score then e else 1 - e end, 4),
         kind
  from (
    select m.*, c.kind,
           1 / (power(10, -(m.elo_home_pre - m.elo_away_pre + case when m.neutral then 0 else 100 end) / 400) + 1) e
    from intlw.matches m join intlw.competitions c on c.name = m.competition
    where c.kind <> 'friendly' and m.home_score <> m.away_score
      and m.elo_home_pre is not null and m.elo_away_pre is not null
  ) s
  where case when home_score > away_score then e else 1 - e end < 0.25;
end $$;

revoke all on function public.intlw_refresh_visuals() from public, anon, authenticated;
grant execute on function public.intlw_refresh_visuals() to service_role;

create view public.intlw_team_year_elo with (security_invoker = true) as
select y.team, t.slug, intlw.name_at(y.team, make_date(y.year, 12, 31)) as name, t.confederation,
       y.year, y.elo, y.rank, y.played
from intlw.team_year_elo y join intlw.teams t on t.team = y.team;

create view public.intlw_upsets with (security_invoker = true) as
select u.expectation, u.kind, m.*
from intlw.upsets u join public.intlw_matches m on m.match_key = u.match_key;

grant select on public.intlw_team_year_elo, public.intlw_upsets to anon, authenticated;

select public.intlw_refresh_visuals();

-- ---------------------------------------------------------------------------
-- from 20261005210000_intl_projections_squads.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- International: projections and squads (5 Oct 2026).
--
-- Projections (model IP1, scripts/intl_projections.py, run by the daily
-- import):
--   intlw.model_info      the fitted parameters, one row per model
--   intlw.projections     win/draw/loss, expected goals and the five likeliest
--                        scores for every unplayed fixture
--   intlw.group_odds      Nations League league phase, simulated 10,000 times:
--                        each team's chance of finishing in each position
--   public.intlw_fixtures now carries the projection columns
--
-- Squads (scripts/intl_squads.py, daily, from each national team's Wikipedia
-- page, CC BY-SA):
--   intlw.squads          one row per nation: page, revision time, the intro
--                        ("named for the matches against..."), caps as of
--   intlw.squad_players   the current squad and recent call-ups
-- ============================================================================

create table intlw.model_info (
  model text primary key,
  params jsonb not null,
  fitted_through int not null,
  updated_at timestamptz not null default now()
);

create table intlw.projections (
  fixture_key text primary key references intlw.fixtures(fixture_key) on delete cascade,
  model text not null,
  elo_home numeric not null,
  elo_away numeric not null,
  p_home numeric not null,
  p_draw numeric not null,
  p_away numeric not null,
  xg_home numeric not null,
  xg_away numeric not null,
  scores jsonb not null,                    -- [{h, a, p}] five likeliest
  updated_at timestamptz not null default now()
);

create table intlw.group_odds (
  edition_key text not null references intlw.editions(edition_key) on delete cascade,
  group_label text not null,
  team text not null references intlw.teams(team),
  played int not null,
  points int not null,
  gd int not null,
  gf int not null,
  p_pos numeric[] not null,                 -- chance of finishing 1st, 2nd, ...
  exp_points numeric not null,
  sims int not null,
  updated_at timestamptz not null default now(),
  primary key (edition_key, team)
);

create table intlw.squads (
  team text primary key references intlw.teams(team) on delete cascade,
  wiki_title text not null,
  revision_at timestamptz,
  intro text,
  caps_as_of text,
  players int not null,
  fetched_at timestamptz not null default now()
);

create table intlw.squad_players (
  team text not null references intlw.squads(team) on delete cascade,
  list text not null check (list in ('current', 'recent')),
  seq int not null,
  number int,
  position text,                            -- GK / DF / MF / FW
  player text not null,
  wiki_title text,
  birth_date date,
  caps int,
  goals int,
  club text,
  club_country text,                        -- FIFA code of the club's league country
  latest_date date,                         -- recent call-ups: latest call-up
  latest_text text,
  status text,                              -- INJ, WD, RET, PRE, SUS ...
  primary key (team, list, seq)
);

alter table intlw.model_info enable row level security;
alter table intlw.projections enable row level security;
alter table intlw.group_odds enable row level security;
alter table intlw.squads enable row level security;
alter table intlw.squad_players enable row level security;
create policy "public read" on intlw.model_info for select to anon, authenticated using (true);
create policy "public read" on intlw.projections for select to anon, authenticated using (true);
create policy "public read" on intlw.group_odds for select to anon, authenticated using (true);
create policy "public read" on intlw.squads for select to anon, authenticated using (true);
create policy "public read" on intlw.squad_players for select to anon, authenticated using (true);
grant select on intlw.model_info, intlw.projections, intlw.group_odds, intlw.squads, intlw.squad_players to anon, authenticated;
grant all on intlw.model_info, intlw.projections, intlw.group_odds, intlw.squads, intlw.squad_players to service_role;

-- ---------------------------------------------------------------------------
-- Writers (service_role only).
-- ---------------------------------------------------------------------------

create or replace function public.intlw_replace_projections(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into intlw.model_info (model, params, fitted_through, updated_at)
  select payload->'model'->>'model', payload->'model'->'params', (payload->'model'->>'fitted_through')::int, now()
  on conflict (model) do update set params = excluded.params, fitted_through = excluded.fitted_through, updated_at = now();

  delete from intlw.projections where true;
  insert into intlw.projections (fixture_key, model, elo_home, elo_away, p_home, p_draw, p_away, xg_home, xg_away, scores)
  select r->>'fixture_key', r->>'model', (r->>'elo_home')::numeric, (r->>'elo_away')::numeric,
         (r->>'p_home')::numeric, (r->>'p_draw')::numeric, (r->>'p_away')::numeric,
         (r->>'xg_home')::numeric, (r->>'xg_away')::numeric, r->'scores'
  from jsonb_array_elements(payload->'projections') r
  where exists (select 1 from intlw.fixtures f where f.fixture_key = r->>'fixture_key');

  delete from intlw.group_odds where true;
  insert into intlw.group_odds (edition_key, group_label, team, played, points, gd, gf, p_pos, exp_points, sims)
  select r->>'edition_key', r->>'group_label', r->>'team', (r->>'played')::int, (r->>'points')::int,
         (r->>'gd')::int, (r->>'gf')::int, array(select jsonb_array_elements_text(r->'p_pos')::numeric),
         (r->>'exp_points')::numeric, (r->>'sims')::int
  from jsonb_array_elements(payload->'group_odds') r;
end $$;

-- Replaces the squads of the nations in the payload; other nations keep theirs
-- (a page that fails to parse never wipes a squad).
create or replace function public.intlw_replace_squads(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intlw.squads s
  where s.team in (select r->>'team' from jsonb_array_elements(payload->'squads') r);
  insert into intlw.squads (team, wiki_title, revision_at, intro, caps_as_of, players)
  select r->>'team', r->>'wiki_title', (r->>'revision_at')::timestamptz, r->>'intro', r->>'caps_as_of', (r->>'players')::int
  from jsonb_array_elements(payload->'squads') r;
  insert into intlw.squad_players (team, list, seq, number, position, player, wiki_title, birth_date, caps, goals,
                                  club, club_country, latest_date, latest_text, status)
  select r->>'team', r->>'list', (r->>'seq')::int, (r->>'number')::int, r->>'position', r->>'player', r->>'wiki_title',
         (r->>'birth_date')::date, (r->>'caps')::int, (r->>'goals')::int, r->>'club', r->>'club_country',
         (r->>'latest_date')::date, r->>'latest_text', r->>'status'
  from jsonb_array_elements(payload->'players') r;
end $$;

revoke all on function public.intlw_replace_projections(jsonb) from public, anon, authenticated;
revoke all on function public.intlw_replace_squads(jsonb) from public, anon, authenticated;
grant execute on function public.intlw_replace_projections(jsonb) to service_role;
grant execute on function public.intlw_replace_squads(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Views.
-- ---------------------------------------------------------------------------

create or replace view public.intlw_fixtures with (security_invoker = true) as
select f.fixture_key, f.edition_key, f.kickoff_utc, f.home_team, ht.slug as home_slug, f.away_team,
       awt.slug as away_slug, f.group_label, f.round_number, f.venue,
       coalesce(m.home_score, f.home_score) as home_score, coalesce(m.away_score, f.away_score) as away_score,
       m.match_key,
       p.p_home, p.p_draw, p.p_away, p.xg_home, p.xg_away, p.scores
from intlw.fixtures f
join intlw.teams ht on ht.team = f.home_team
join intlw.teams awt on awt.team = f.away_team
left join intlw.matches m on m.home_team = f.home_team and m.away_team = f.away_team
  and m.match_date between (f.kickoff_utc at time zone 'Europe/London')::date - 1
                       and (f.kickoff_utc at time zone 'Europe/London')::date + 1
left join intlw.projections p on p.fixture_key = f.fixture_key;

create view public.intlw_group_odds with (security_invoker = true) as
select o.edition_key, o.group_label, o.team, t.slug, o.played, o.points, o.gd, o.gf, o.p_pos, o.exp_points, o.sims, o.updated_at
from intlw.group_odds o join intlw.teams t on t.team = o.team;

create view public.intlw_squads with (security_invoker = true) as
select s.team, t.slug, s.wiki_title, s.revision_at, s.intro, s.caps_as_of, s.players, s.fetched_at
from intlw.squads s join intlw.teams t on t.team = s.team;

create view public.intlw_squad_players with (security_invoker = true) as
select p.team, t.slug, p.list, p.seq, p.number, p.position, p.player, p.wiki_title, p.birth_date, p.caps, p.goals,
       p.club, p.club_country, p.latest_date, p.latest_text, p.status
from intlw.squad_players p join intlw.teams t on t.team = p.team;

grant select on public.intlw_fixtures, public.intlw_group_odds, public.intlw_squads, public.intlw_squad_players to anon, authenticated;

-- ---------------------------------------------------------------------------
-- from 20261005220000_intl_clubs.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- International: where squad players play (5 Oct 2026).
--
-- scripts/intl_squads.py now matches each player's club (Wikipedia wikilink +
-- the FIFA code of its league country) to:
--   * the league country's name                  -> club_league_country
--   * the FixtureShark club page (public.teams)   -> club_slug
--   * ClubElo (api.clubelo.com, mainly Europe)    -> clubelo_name, club_elo, club_elo_rank
-- and stores the day's ClubElo table (intlw.club_elo) for the world club list.
--
-- Views:
--   intl_squad_players   gains the columns above
--   intl_club_callups    clubs by internationals in current squads
--   intl_league_exports  league countries by internationals they hold
--   intl_club_elo        the ClubElo table with each club's internationals
--   intl_squad_club_strength  each squad: at home / abroad, average club rating
--
-- Also: intlw.group_odds.zones (Nations League quarter-finals / promotion /
-- play-off / relegation chances) and its writer and view.
-- ============================================================================

alter table intlw.squad_players add column if not exists club_wiki text;
alter table intlw.squad_players add column if not exists club_league_country text;
alter table intlw.squad_players add column if not exists club_slug text;
alter table intlw.squad_players add column if not exists clubelo_name text;
alter table intlw.squad_players add column if not exists club_elo numeric;
alter table intlw.squad_players add column if not exists club_elo_rank int;

create index if not exists intl_squad_players_clubelo_idx on intlw.squad_players (clubelo_name);

create table intlw.club_elo (
  club text primary key,                    -- ClubElo's name
  country text,                             -- ClubElo's country code
  level int,                                -- league tier
  elo numeric not null,
  rank int not null,                        -- among every club in the table
  club_slug text,                           -- FixtureShark club page, when we have it
  fetched_on date not null
);
alter table intlw.club_elo enable row level security;
create policy "public read" on intlw.club_elo for select to anon, authenticated using (true);
grant select on intlw.club_elo to anon, authenticated;
grant all on intlw.club_elo to service_role;

create or replace function public.intlw_replace_squads(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intlw.squads s
  where s.team in (select r->>'team' from jsonb_array_elements(payload->'squads') r);
  insert into intlw.squads (team, wiki_title, revision_at, intro, caps_as_of, players)
  select r->>'team', r->>'wiki_title', (r->>'revision_at')::timestamptz, r->>'intro', r->>'caps_as_of', (r->>'players')::int
  from jsonb_array_elements(payload->'squads') r;
  insert into intlw.squad_players (team, list, seq, number, position, player, wiki_title, birth_date, caps, goals,
                                  club, club_country, latest_date, latest_text, status,
                                  club_wiki, club_league_country, club_slug, clubelo_name, club_elo, club_elo_rank)
  select r->>'team', r->>'list', (r->>'seq')::int, (r->>'number')::int, r->>'position', r->>'player', r->>'wiki_title',
         (r->>'birth_date')::date, (r->>'caps')::int, (r->>'goals')::int, r->>'club', r->>'club_country',
         (r->>'latest_date')::date, r->>'latest_text', r->>'status',
         r->>'club_wiki', r->>'club_league_country', r->>'club_slug', r->>'clubelo_name',
         (r->>'club_elo')::numeric, (r->>'club_elo_rank')::int
  from jsonb_array_elements(payload->'players') r;
end $$;

create or replace function public.intlw_replace_club_elo(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_array_length(payload) < 100 then
    raise exception 'ClubElo table too short (% rows) -- keeping the stored one', jsonb_array_length(payload);
  end if;
  delete from intlw.club_elo where true;
  insert into intlw.club_elo (club, country, level, elo, rank, club_slug, fetched_on)
  select r->>'club', r->>'country', (r->>'level')::int, (r->>'elo')::numeric, (r->>'rank')::int, r->>'club_slug',
         (r->>'fetched_on')::date
  from jsonb_array_elements(payload) r
  on conflict (club) do nothing;
end $$;

revoke all on function public.intlw_replace_squads(jsonb) from public, anon, authenticated;
revoke all on function public.intlw_replace_club_elo(jsonb) from public, anon, authenticated;
grant execute on function public.intlw_replace_squads(jsonb) to service_role;
grant execute on function public.intlw_replace_club_elo(jsonb) to service_role;

create or replace view public.intlw_squad_players with (security_invoker = true) as
select p.team, t.slug, p.list, p.seq, p.number, p.position, p.player, p.wiki_title, p.birth_date, p.caps, p.goals,
       p.club, p.club_country, p.latest_date, p.latest_text, p.status,
       p.club_wiki, p.club_league_country, p.club_slug, p.clubelo_name, p.club_elo, p.club_elo_rank
from intlw.squad_players p join intlw.teams t on t.team = p.team;

-- Clubs by internationals in the current squads (one row per club).
create view public.intlw_club_callups with (security_invoker = true) as
select coalesce(p.club_wiki, p.club) as club_key, min(p.club) as club, min(p.club_league_country) as league_country,
       min(p.club_slug) as club_slug, max(p.club_elo) as club_elo, min(p.club_elo_rank) as club_elo_rank,
       count(*) as players, count(distinct p.team) as nations,
       jsonb_agg(jsonb_build_object('team', p.team, 'slug', t.slug, 'player', p.player, 'caps', p.caps)
                 order by p.team, p.caps desc nulls last) as callups
from intlw.squad_players p join intlw.teams t on t.team = p.team
where p.list = 'current' and p.club is not null
group by coalesce(p.club_wiki, p.club);

-- League countries by internationals playing there.
create view public.intlw_league_exports with (security_invoker = true) as
select p.club_league_country as league_country, count(*) as players, count(distinct p.team) as nations,
       count(distinct coalesce(p.club_wiki, p.club)) as clubs,
       count(*) filter (where p.team <> p.club_league_country) as foreign_players
from intlw.squad_players p
where p.list = 'current' and p.club_league_country is not null
group by p.club_league_country;

create view public.intlw_club_elo with (security_invoker = true) as
select e.club, e.country, e.level, e.elo, e.rank, e.club_slug, e.fetched_on,
       (select count(*) from intlw.squad_players p where p.list = 'current' and p.clubelo_name = e.club) as internationals
from intlw.club_elo e;

-- Each nation's current squad by where its players play: at home or abroad,
-- and the average ClubElo rating of the clubs that are rated.
create view public.intlw_squad_club_strength with (security_invoker = true) as
select p.team, t.slug, ts.confederation, count(*) as players,
       count(*) filter (where p.club_league_country = p.team) as at_home,
       count(*) filter (where p.club_league_country is not null and p.club_league_country <> p.team) as abroad,
       count(p.club_elo) as rated, round(avg(p.club_elo), 0) as avg_club_elo,
       count(distinct p.club_league_country) as league_countries
from intlw.squad_players p
join intlw.teams t on t.team = p.team
left join intlw.team_summary ts on ts.team = p.team
where p.list = 'current'
group by p.team, t.slug, ts.confederation;

grant select on public.intlw_squad_players, public.intlw_club_callups, public.intlw_league_exports, public.intlw_club_elo,
  public.intlw_squad_club_strength to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Nations League zones: what each team's simulated finish leads to
-- (quarter-finals, promotion, play-offs, relegation), from intl_projections.
-- ---------------------------------------------------------------------------

alter table intlw.group_odds add column if not exists zones jsonb not null default '{}';

create or replace function public.intlw_replace_projections(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into intlw.model_info (model, params, fitted_through, updated_at)
  select payload->'model'->>'model', payload->'model'->'params', (payload->'model'->>'fitted_through')::int, now()
  on conflict (model) do update set params = excluded.params, fitted_through = excluded.fitted_through, updated_at = now();

  delete from intlw.projections where true;
  insert into intlw.projections (fixture_key, model, elo_home, elo_away, p_home, p_draw, p_away, xg_home, xg_away, scores)
  select r->>'fixture_key', r->>'model', (r->>'elo_home')::numeric, (r->>'elo_away')::numeric,
         (r->>'p_home')::numeric, (r->>'p_draw')::numeric, (r->>'p_away')::numeric,
         (r->>'xg_home')::numeric, (r->>'xg_away')::numeric, r->'scores'
  from jsonb_array_elements(payload->'projections') r
  where exists (select 1 from intlw.fixtures f where f.fixture_key = r->>'fixture_key');

  delete from intlw.group_odds where true;
  insert into intlw.group_odds (edition_key, group_label, team, played, points, gd, gf, p_pos, exp_points, sims, zones)
  select r->>'edition_key', r->>'group_label', r->>'team', (r->>'played')::int, (r->>'points')::int,
         (r->>'gd')::int, (r->>'gf')::int, array(select jsonb_array_elements_text(r->'p_pos')::numeric),
         (r->>'exp_points')::numeric, (r->>'sims')::int, coalesce(r->'zones', '{}'::jsonb)
  from jsonb_array_elements(payload->'group_odds') r;
end $$;

revoke all on function public.intlw_replace_projections(jsonb) from public, anon, authenticated;
grant execute on function public.intlw_replace_projections(jsonb) to service_role;

create or replace view public.intlw_group_odds with (security_invoker = true) as
select o.edition_key, o.group_label, o.team, t.slug, o.played, o.points, o.gd, o.gf, o.p_pos, o.exp_points, o.sims, o.updated_at,
       o.zones
from intlw.group_odds o join intlw.teams t on t.team = o.team;

grant select on public.intlw_group_odds to anon, authenticated;

-- ---------------------------------------------------------------------------
-- from 20261006110000_intl_squad_snapshots.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- International squad watch (6 Oct 2026).
--
-- Chris asked for the FPL Minutes Outlook idea on the international side.
-- There's no free source of international line-ups or minutes, so this tracks
-- selection instead: who is in each squad, who drops out and why, and -- from
-- caps going up between snapshots -- who actually played.
--
-- intlw.squad_versions          one row per nation each time its squad changes
--                              (players, caps, goals or status): date, the
--                              squad's intro ("named for the matches against
--                              ...") and a signature of the content
-- intlw.squad_snapshot_players  the players of each version, current squad and
--                              recent call-ups, with caps, goals and status
--
-- public.intlw_snapshot_squads() compares every nation's stored squad
-- (intlw.squad_players) with its latest version and saves a new version only
-- when something changed, so the history grows by a few versions per nation
-- per international window rather than one per day. The squads job calls it
-- after each load.
-- ============================================================================

create table intlw.squad_versions (
  team text not null references intlw.teams(team) on delete cascade,
  version_at date not null,
  signature text not null,                  -- md5 of the squad content
  intro text,
  intro_signature text,                     -- md5 of the intro: changes when a new squad is named
  players int not null,
  primary key (team, version_at)
);

create table intlw.squad_snapshot_players (
  team text not null,
  version_at date not null,
  list text not null check (list in ('current', 'recent')),
  player_key text not null,                 -- Wikipedia title, else the name
  player text not null,
  wiki_title text,
  position text,
  number int,
  caps int,
  goals int,
  club text,
  club_slug text,
  status text,
  latest_date date,
  latest_text text,
  primary key (team, version_at, list, player_key),
  foreign key (team, version_at) references intlw.squad_versions(team, version_at) on delete cascade
);

alter table intlw.squad_versions enable row level security;
alter table intlw.squad_snapshot_players enable row level security;
create policy "public read" on intlw.squad_versions for select to anon, authenticated using (true);
create policy "public read" on intlw.squad_snapshot_players for select to anon, authenticated using (true);
grant select on intlw.squad_versions, intlw.squad_snapshot_players to anon, authenticated;
grant all on intlw.squad_versions, intlw.squad_snapshot_players to service_role;

create or replace function public.intlw_snapshot_squads(p_date date default current_date)
returns int language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  with cur as (
    select s.team, s.intro, md5(coalesce(s.intro, '')) intro_sig,
           md5(string_agg(p.list || '|' || coalesce(p.wiki_title, p.player) || '|' || coalesce(p.caps, -1) || '|' ||
                          coalesce(p.goals, -1) || '|' || coalesce(p.status, ''), ';'
                          order by p.list, coalesce(p.wiki_title, p.player))) sig,
           count(*) filter (where p.list = 'current') n_players
    from intlw.squads s join intlw.squad_players p on p.team = s.team
    group by s.team, s.intro
  ),
  latest as (
    select distinct on (team) team, signature from intlw.squad_versions order by team, version_at desc
  ),
  changed as (
    select c.* from cur c left join latest l on l.team = c.team
    where l.signature is distinct from c.sig
  ),
  ins as (
    insert into intlw.squad_versions (team, version_at, signature, intro, intro_signature, players)
    select team, p_date, sig, intro, intro_sig, n_players from changed
    on conflict (team, version_at) do update
      set signature = excluded.signature, intro = excluded.intro, intro_signature = excluded.intro_signature,
          players = excluded.players
    returning team
  )
  select count(*) into v_changed from ins;

  -- The players of every version saved today (replaced if the job runs twice in a day).
  delete from intlw.squad_snapshot_players sp
  where sp.version_at = p_date
    and exists (select 1 from intlw.squad_versions v where v.team = sp.team and v.version_at = p_date);
  insert into intlw.squad_snapshot_players (team, version_at, list, player_key, player, wiki_title, position, number,
                                           caps, goals, club, club_slug, status, latest_date, latest_text)
  select p.team, p_date, p.list, coalesce(p.wiki_title, p.player), min(p.player), min(p.wiki_title), min(p.position),
         min(p.number), max(p.caps), max(p.goals), min(p.club), min(p.club_slug), min(p.status), max(p.latest_date),
         min(p.latest_text)
  from intlw.squad_players p
  join intlw.squad_versions v on v.team = p.team and v.version_at = p_date
  group by p.team, p.list, coalesce(p.wiki_title, p.player)
  on conflict do nothing;
  return v_changed;
end $$;

revoke all on function public.intlw_snapshot_squads(date) from public, anon, authenticated;
grant execute on function public.intlw_snapshot_squads(date) to service_role;

create view public.intlw_squad_versions with (security_invoker = true) as
select v.team, t.slug, v.version_at, v.intro, v.intro_signature, v.players
from intlw.squad_versions v join intlw.teams t on t.team = v.team;

create view public.intlw_squad_snapshot_players with (security_invoker = true) as
select p.team, t.slug, p.version_at, p.list, p.player_key, p.player, p.wiki_title, p.position, p.number, p.caps, p.goals,
       p.club, p.club_slug, p.status, p.latest_date, p.latest_text
from intlw.squad_snapshot_players p join intlw.teams t on t.team = p.team;

grant select on public.intlw_squad_versions, public.intlw_squad_snapshot_players to anon, authenticated;

-- First snapshot from the squads already stored.
select public.intlw_snapshot_squads(current_date);

-- ---------------------------------------------------------------------------
-- from 20261006200000_intl_model_info_view.sql
-- ---------------------------------------------------------------------------
-- ============================================================================
-- International match pages (6 Oct 2026): the browser works out what model
-- IP1 expected for any game -- played or coming -- from the two teams' Elo
-- ratings, so it needs the fitted parameters. Read-only view over
-- intlw.model_info (scripts/intl_projections.py writes it daily).
-- ============================================================================

create or replace view public.intlw_model_info with (security_invoker = true) as
select model, params, fitted_through, updated_at from intlw.model_info;

grant select on public.intlw_model_info to anon, authenticated;

-- ============================================================================
-- International football, phase 1 (data). Design: Claude Docs doc
-- "International football section — design" (5 Oct 2026).
--
-- An intl schema written only by service_role through the functions below
-- (scripts/intl_import.py, daily via intl-import.yml); anon-readable views in
-- public. Teams are keyed by the source's lineage name (martj42 files Soviet
-- Union games under Russia); intl.team_names holds the name used at the time.
-- Match key: date|home|away, plus |2 for the one true duplicate in the source.
-- Every source row is kept whole in raw.
-- ============================================================================

create schema if not exists intl;
grant usage on schema intl to anon, authenticated, service_role;

create table intl.teams (
  team text primary key,                    -- lineage name, as in the source
  slug text not null unique,
  confederation text check (confederation in ('UEFA', 'CONMEBOL', 'CONCACAF', 'CAF', 'AFC', 'OFC')),
  first_match date not null,
  last_match date not null,
  matches int not null
);

create table intl.team_names (
  team text not null references intl.teams(team) on delete cascade,
  name text not null,                       -- e.g. Dahomey for Benin
  valid_from date not null,
  valid_to date not null,
  primary key (team, name, valid_from)
);

create table intl.competitions (
  name text primary key,                    -- source tournament name
  slug text not null unique,
  kind text not null check (kind in ('friendly', 'qualifying', 'nations_league', 'tournament')),
  confederation text,
  matches int not null
);

create table intl.editions (
  edition_key text primary key,             -- WC-2026, EURO-2020, UNL-2026-27
  competition text not null references intl.competitions(name),
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

create table intl.stages (
  stage_key text primary key,               -- edition|code
  edition_key text not null references intl.editions(edition_key) on delete cascade,
  code text not null,                       -- GRP, R16, QF, SF, 3P, F, LP, PO_AB, ...
  name text not null,
  type text not null check (type in ('round_robin', 'knockout')),
  stage_order int not null,
  unique (edition_key, code)
);

create table intl.groups (
  group_key text primary key,               -- edition|stage|label
  stage_key text not null references intl.stages(stage_key) on delete cascade,
  label text not null,                      -- A, 1, A3
  league text,                              -- Nations League A-D
  size int not null
);

create table intl.group_members (
  group_key text not null references intl.groups(group_key) on delete cascade,
  team text not null references intl.teams(team),
  primary key (group_key, team)
);

create table intl.matches (
  match_key text primary key,
  match_date date not null,
  home_team text not null references intl.teams(team),
  away_team text not null references intl.teams(team),
  home_score int not null,                  -- final score, including extra time
  away_score int not null,
  competition text not null references intl.competitions(name),
  city text,
  country text,
  neutral boolean not null,
  edition_key text references intl.editions(edition_key),
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
create index intl_matches_date_idx on intl.matches (match_date);
create index intl_matches_home_idx on intl.matches (home_team, match_date);
create index intl_matches_away_idx on intl.matches (away_team, match_date);
create index intl_matches_edition_idx on intl.matches (edition_key, stage_code);
create index intl_matches_competition_idx on intl.matches (competition, match_date);

create table intl.goals (
  match_key text not null references intl.matches(match_key) on delete cascade,
  seq int not null,
  team text not null,
  scorer text,
  minute int,
  own_goal boolean not null,
  penalty boolean not null,
  primary key (match_key, seq)
);
create index intl_goals_scorer_idx on intl.goals (team, scorer);

create table intl.shootouts (
  match_key text primary key references intl.matches(match_key) on delete cascade,
  winner text not null,
  first_shooter text
);

-- Upcoming games (the source of results has no fixtures). 2026/27 Nations
-- League from fixturedownload.com; joined to a result by date and teams.
create table intl.fixtures (
  fixture_key text primary key,             -- edition|feed match number
  edition_key text not null,
  kickoff_utc timestamptz not null,
  home_team text not null references intl.teams(team),
  away_team text not null references intl.teams(team),
  group_label text,
  round_number int,
  venue text,
  home_score int,                           -- the feed's score, if it ever carries one
  away_score int,
  source text not null,
  raw jsonb not null,
  updated_at timestamptz not null default now()
);
create index intl_fixtures_kickoff_idx on intl.fixtures (kickoff_utc);

-- UK TV rights, hand-kept (filled in phase 3).
create table intl.broadcasters (
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
create table intl.team_competition_totals (
  team text not null,
  competition text not null,
  played int not null, won int not null, drawn int not null, lost int not null,
  goals_for int not null, goals_against int not null,
  first_match date not null, last_match date not null,
  primary key (team, competition)
);

create table intl.pair_records (
  team_a text not null,                     -- team_a < team_b
  team_b text not null,
  played int not null, a_won int not null, drawn int not null, b_won int not null,
  a_goals int not null, b_goals int not null,
  first_meeting date not null, last_meeting date not null,
  primary key (team_a, team_b)
);
create index intl_pair_records_b_idx on intl.pair_records (team_b);

do $$
declare t text;
begin
  foreach t in array array['teams', 'team_names', 'competitions', 'editions', 'stages', 'groups', 'group_members',
                           'matches', 'goals', 'shootouts', 'fixtures', 'broadcasters',
                           'team_competition_totals', 'pair_records'] loop
    execute format('alter table intl.%I enable row level security', t);
    execute format('create policy "public read" on intl.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
grant select on all tables in schema intl to anon, authenticated;
grant all on all tables in schema intl to service_role;

-- Name used at the time (Dahomey before 30 Nov 1975), else the lineage name.
create or replace function intl.name_at(p_team text, p_date date)
returns text language sql stable set search_path = '' as $$
  select coalesce((select n.name from intl.team_names n
                   where n.team = p_team and p_date between n.valid_from and n.valid_to
                   order by n.valid_from desc limit 1), p_team)
$$;
grant execute on function intl.name_at(text, date) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Writers (service_role only).
-- ---------------------------------------------------------------------------

-- Small reference tables, synced whole: rows not in the payload are removed
-- (except editions and teams, which matches may still point at).
create or replace function public.intl_load_reference(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into intl.teams (team, slug, confederation, first_match, last_match, matches)
  select r->>'team', r->>'slug', r->>'confederation', (r->>'first_match')::date, (r->>'last_match')::date,
         (r->>'matches')::int
  from jsonb_array_elements(payload->'teams') r
  on conflict (team) do update set slug = excluded.slug, confederation = excluded.confederation,
    first_match = excluded.first_match, last_match = excluded.last_match, matches = excluded.matches;

  delete from intl.team_names;
  insert into intl.team_names (team, name, valid_from, valid_to)
  select r->>'team', r->>'name', (r->>'valid_from')::date, (r->>'valid_to')::date
  from jsonb_array_elements(payload->'team_names') r;

  insert into intl.competitions (name, slug, kind, confederation, matches)
  select r->>'name', r->>'slug', r->>'kind', r->>'confederation', (r->>'matches')::int
  from jsonb_array_elements(payload->'competitions') r
  on conflict (name) do update set slug = excluded.slug, kind = excluded.kind,
    confederation = excluded.confederation, matches = excluded.matches;

  insert into intl.editions (edition_key, competition, label, season_start, teams, matches, hosts,
                             first_match, last_match, stage_source)
  select r->>'edition_key', r->>'competition', r->>'label', (r->>'season_start')::int, (r->>'teams')::int,
         (r->>'matches')::int, array(select jsonb_array_elements_text(r->'hosts')),
         (r->>'first_match')::date, (r->>'last_match')::date, r->>'stage_source'
  from jsonb_array_elements(payload->'editions') r
  on conflict (edition_key) do update set competition = excluded.competition, label = excluded.label,
    season_start = excluded.season_start, teams = excluded.teams, matches = excluded.matches,
    hosts = excluded.hosts, first_match = excluded.first_match, last_match = excluded.last_match,
    stage_source = excluded.stage_source;

  insert into intl.stages (stage_key, edition_key, code, name, type, stage_order)
  select r->>'stage_key', r->>'edition_key', r->>'code', r->>'name', r->>'type', (r->>'stage_order')::int
  from jsonb_array_elements(payload->'stages') r
  on conflict (stage_key) do update set name = excluded.name, type = excluded.type,
    stage_order = excluded.stage_order;
  delete from intl.stages s
  where not exists (select 1 from jsonb_array_elements(payload->'stages') r where r->>'stage_key' = s.stage_key);

  insert into intl.groups (group_key, stage_key, label, league, size)
  select r->>'group_key', r->>'stage_key', r->>'label', r->>'league', (r->>'size')::int
  from jsonb_array_elements(payload->'groups') r
  on conflict (group_key) do update set label = excluded.label, league = excluded.league, size = excluded.size;
  delete from intl.groups g
  where not exists (select 1 from jsonb_array_elements(payload->'groups') r where r->>'group_key' = g.group_key);

  delete from intl.group_members;
  insert into intl.group_members (group_key, team)
  select r->>'group_key', r->>'team' from jsonb_array_elements(payload->'group_members') r;
end $$;

create or replace function public.intl_upsert_matches(rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into intl.matches as m (match_key, match_date, home_team, away_team, home_score, away_score, competition,
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

create or replace function public.intl_replace_goals(rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intl.goals g
  where g.match_key in (select distinct r->>'match_key' from jsonb_array_elements(rows) r);
  insert into intl.goals (match_key, seq, team, scorer, minute, own_goal, penalty)
  select r->>'match_key', (r->>'seq')::int, r->>'team', r->>'scorer', (r->>'minute')::int,
         (r->>'own_goal')::boolean, (r->>'penalty')::boolean
  from jsonb_array_elements(rows) r;
end $$;

create or replace function public.intl_replace_shootouts(rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intl.shootouts;
  insert into intl.shootouts (match_key, winner, first_shooter)
  select r->>'match_key', r->>'winner', r->>'first_shooter' from jsonb_array_elements(rows) r;
end $$;

create or replace function public.intl_upsert_fixtures(rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into intl.fixtures as f (fixture_key, edition_key, kickoff_utc, home_team, away_team, group_label,
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
create or replace function public.intl_year_totals()
returns table (year int, matches bigint, goals bigint, key_hash text)
language sql stable security definer set search_path = '' as $$
  select extract(year from match_date)::int, count(*), sum(home_score + away_score),
         md5(string_agg(match_key, E'\n' order by match_key collate "C"))
  from intl.matches group by 1 order by 1
$$;

create or replace function public.intl_match_keys(p_year int)
returns setof text language sql stable security definer set search_path = '' as $$
  select match_key from intl.matches where extract(year from match_date) = p_year
$$;

create or replace function public.intl_delete_matches(keys jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from intl.matches where match_key in (select jsonb_array_elements_text(keys));
  get diagnostics n = row_count;
  return n;
end $$;

-- Aggregates the pages read. Wins and losses are by the final score;
-- a shoot-out counts as a draw.
create or replace function public.intl_refresh()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intl.team_competition_totals;
  insert into intl.team_competition_totals
  select team, competition, count(*), count(*) filter (where gf > ga), count(*) filter (where gf = ga),
         count(*) filter (where gf < ga), sum(gf), sum(ga), min(match_date), max(match_date)
  from (select home_team team, competition, home_score gf, away_score ga, match_date from intl.matches
        union all
        select away_team, competition, away_score, home_score, match_date from intl.matches) s
  group by team, competition;

  delete from intl.pair_records;
  insert into intl.pair_records
  select a, b, count(*), count(*) filter (where ag > bg), count(*) filter (where ag = bg),
         count(*) filter (where ag < bg), sum(ag), sum(bg), min(match_date), max(match_date)
  from (select least(home_team, away_team) a, greatest(home_team, away_team) b,
               case when home_team < away_team then home_score else away_score end ag,
               case when home_team < away_team then away_score else home_score end bg, match_date
        from intl.matches) s
  group by a, b;
end $$;

do $$
declare f text;
begin
  foreach f in array array['intl_load_reference(jsonb)', 'intl_upsert_matches(jsonb)', 'intl_replace_goals(jsonb)',
                           'intl_replace_shootouts(jsonb)', 'intl_upsert_fixtures(jsonb)', 'intl_year_totals()',
                           'intl_match_keys(int)', 'intl_delete_matches(jsonb)', 'intl_refresh()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Public read views.
-- ---------------------------------------------------------------------------

create view public.intl_teams with (security_invoker = true) as
select team, slug, confederation, first_match, last_match, matches,
       confederation is not null as is_confederation_member
from intl.teams;

create view public.intl_team_names with (security_invoker = true) as
select team, name, valid_from, valid_to from intl.team_names;

create view public.intl_competitions with (security_invoker = true) as
select name, slug, kind, confederation, matches from intl.competitions;

create view public.intl_editions with (security_invoker = true) as
select e.edition_key, e.competition, c.slug as competition_slug, e.label, e.season_start, e.teams, e.matches,
       e.hosts, e.first_match, e.last_match, e.stage_source
from intl.editions e join intl.competitions c on c.name = e.competition;

create view public.intl_stages with (security_invoker = true) as
select stage_key, edition_key, code, name, type, stage_order from intl.stages;

create view public.intl_groups with (security_invoker = true) as
select g.group_key, s.edition_key, s.code as stage_code, g.label, g.league, g.size,
       array(select gm.team from intl.group_members gm where gm.group_key = g.group_key order by gm.team) as teams
from intl.groups g join intl.stages s on s.stage_key = g.stage_key;

create view public.intl_matches with (security_invoker = true) as
select m.match_key, m.match_date, m.home_team, ht.slug as home_slug, intl.name_at(m.home_team, m.match_date) as home_name,
       m.away_team, awt.slug as away_slug, intl.name_at(m.away_team, m.match_date) as away_name,
       m.home_score, m.away_score, m.home_score_90, m.away_score_90, m.went_extra_time, m.shootout_winner,
       m.competition, c.slug as competition_slug, c.kind as competition_kind,
       m.edition_key, m.stage_code, s.name as stage_name, s.type as stage_type, m.group_label, m.matchday,
       m.city, m.country, m.neutral, m.elo_home_pre, m.elo_away_pre, m.elo_change
from intl.matches m
join intl.teams ht on ht.team = m.home_team
join intl.teams awt on awt.team = m.away_team
join intl.competitions c on c.name = m.competition
left join intl.stages s on s.edition_key = m.edition_key and s.code = m.stage_code;

-- Fixtures with their result once the results file has it (same UK date,
-- same teams); until then the page shows "Result to follow".
create view public.intl_fixtures with (security_invoker = true) as
select f.fixture_key, f.edition_key, f.kickoff_utc, f.home_team, ht.slug as home_slug, f.away_team,
       awt.slug as away_slug, f.group_label, f.round_number, f.venue,
       coalesce(m.home_score, f.home_score) as home_score, coalesce(m.away_score, f.away_score) as away_score,
       m.match_key
from intl.fixtures f
join intl.teams ht on ht.team = f.home_team
join intl.teams awt on awt.team = f.away_team
left join intl.matches m on m.home_team = f.home_team and m.away_team = f.away_team
  and m.match_date between (f.kickoff_utc at time zone 'Europe/London')::date - 1
                       and (f.kickoff_utc at time zone 'Europe/London')::date + 1;

create view public.intl_team_competition_totals with (security_invoker = true) as
select t.team, t.competition, c.kind as competition_kind, t.played, t.won, t.drawn, t.lost,
       t.goals_for, t.goals_against, t.first_match, t.last_match
from intl.team_competition_totals t join intl.competitions c on c.name = t.competition;

create view public.intl_pair_records with (security_invoker = true) as
select team_a, team_b, played, a_won, drawn, b_won, a_goals, b_goals, first_meeting, last_meeting
from intl.pair_records;

create view public.intl_goals with (security_invoker = true) as
select match_key, seq, team, scorer, minute, own_goal, penalty from intl.goals;

grant select on public.intl_teams, public.intl_team_names, public.intl_competitions, public.intl_editions,
  public.intl_stages, public.intl_groups, public.intl_matches, public.intl_fixtures,
  public.intl_team_competition_totals, public.intl_pair_records, public.intl_goals to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Integrity (daily, via scripts/run_integrity_checks.py).
-- ---------------------------------------------------------------------------
create or replace function public.check_intl_integrity()
returns table (check_name text, status text, found bigint, detail text)
language sql stable security definer set search_path = '' as $$
  select 'intl_fresh',
    case when age_days is null or age_days >= 5 then 'failed' when age_days >= 2 then 'warning' else 'ok' end,
    coalesce(age_days, -1)::bigint,
    'Days since the last successful intl_import run (daily on GitHub Actions; warns at 2, fails at 5; -1 = never)'
  from (select extract(day from now() - max(finished_at))::int age_days
        from public.pipeline_runs where job_name = 'intl_import' and status = 'success') x
  union all
  select 'intl_major_games_staged', case when n = 0 then 'ok' else 'failed' end, n,
    'World Cup and Euro finals games without an edition and stage'
  from (select count(*) n from intl.matches
        where competition in ('FIFA World Cup', 'UEFA Euro') and (edition_key is null or stage_code is null)) x
  union all
  select 'intl_stage_rows', case when n = 0 then 'ok' else 'failed' end, n,
    'Matches whose edition and stage have no intl.stages row'
  from (select count(*) n from intl.matches m
        where m.edition_key is not null
          and not exists (select 1 from intl.stages s where s.edition_key = m.edition_key and s.code = m.stage_code)) x
  union all
  select 'intl_elo_complete', case when n = 0 then 'ok' else 'failed' end, n,
    'Matches without Elo ratings'
  from (select count(*) n from intl.matches where elo_change is null) x
  union all
  -- The results file trails the games by days to weeks; this is a watch, not a fault.
  select 'intl_results_lag', case when n = 0 then 'ok' else 'warning' end, n,
    'Fixtures more than 14 days old with no result in the results file yet'
  from (select count(*) n from public.intl_fixtures
        where kickoff_utc < now() - interval '14 days' and match_key is null) x
$$;
revoke all on function public.check_intl_integrity() from public, anon, authenticated;
grant execute on function public.check_intl_integrity() to service_role;

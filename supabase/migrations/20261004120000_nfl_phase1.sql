-- ============================================================================
-- NFL phase 1: results, schedule and standings (4 Oct 2026).
--
-- Source: nflverse games.csv and teams.csv
-- (github.com/nflverse/nfldata), loaded by scripts/nfl_import.py, from 2002,
-- the first season of the current 32-team, 8-division alignment.
--
-- Layout: raw tables live in their own schema, nfl, which PostgREST does NOT
-- expose. The site reads public.nfl_* views (security_invoker, so the
-- tables' own grants and RLS apply); the importer writes through
-- public.nfl_upsert_* functions that only service_role may execute.
-- ============================================================================

create schema if not exists nfl;
grant usage on schema nfl to anon, authenticated, service_role;

-- One row per franchise, keyed by its current nflverse code. Divisions have
-- not changed since 2002, which is why phase 1 starts there.
create table nfl.franchises (
  franchise text primary key,              -- current code, e.g. 'LV'
  slug text not null unique,               -- URL segment, e.g. 'las-vegas-raiders'
  name text not null,                      -- current full name
  short_name text not null,                -- nickname, e.g. 'Raiders'
  conference text not null check (conference in ('AFC', 'NFC')),
  division text not null check (division in ('East', 'North', 'South', 'West'))
);

-- Every code a franchise has used in the source (OAK -> LV, SD -> LAC, STL -> LA).
create table nfl.team_codes (
  code text primary key,
  franchise text not null references nfl.franchises(franchise)
);

-- The franchise's name in each season (Oakland Raiders 2002-19, Washington
-- Redskins / Football Team / Commanders, ...), from nflverse teams.csv.
create table nfl.team_seasons (
  season int not null,
  code text not null references nfl.team_codes(code),
  full_name text not null,
  primary key (season, code)
);

create table nfl.games (
  game_id text primary key,                -- nflverse id, e.g. '2026_01_NE_SEA'
  season int not null,
  game_type text not null check (game_type in ('REG', 'WC', 'DIV', 'CON', 'SB')),
  week int not null,
  gameday date not null,                   -- US Eastern calendar date
  gametime text,                           -- US Eastern 'HH:MM' as published
  kickoff_at timestamptz,                  -- gameday + gametime in America/New_York
  away_code text not null references nfl.team_codes(code),
  home_code text not null references nfl.team_codes(code),
  away_score int,
  home_score int,
  overtime boolean,
  neutral_site boolean not null default false,
  div_game boolean not null default false,
  spread_line numeric,                     -- closing line, + = home favoured (nflverse convention)
  total_line numeric,
  away_moneyline int,
  home_moneyline int,
  roof text,
  surface text,
  stadium text,
  away_qb_name text,
  home_qb_name text,
  away_coach text,
  home_coach text,
  imported_at timestamptz not null default now(),
  check ((away_score is null) = (home_score is null))
);
create index nfl_games_season_idx on nfl.games (season, week);

alter table nfl.franchises enable row level security;
alter table nfl.team_codes enable row level security;
alter table nfl.team_seasons enable row level security;
alter table nfl.games enable row level security;
create policy "public read" on nfl.franchises for select to anon, authenticated using (true);
create policy "public read" on nfl.team_codes for select to anon, authenticated using (true);
create policy "public read" on nfl.team_seasons for select to anon, authenticated using (true);
create policy "public read" on nfl.games for select to anon, authenticated using (true);
grant select on all tables in schema nfl to anon, authenticated;
grant all on all tables in schema nfl to service_role;

insert into nfl.franchises (franchise, slug, name, short_name, conference, division) values
  ('BUF', 'buffalo-bills', 'Buffalo Bills', 'Bills', 'AFC', 'East'),
  ('MIA', 'miami-dolphins', 'Miami Dolphins', 'Dolphins', 'AFC', 'East'),
  ('NE',  'new-england-patriots', 'New England Patriots', 'Patriots', 'AFC', 'East'),
  ('NYJ', 'new-york-jets', 'New York Jets', 'Jets', 'AFC', 'East'),
  ('BAL', 'baltimore-ravens', 'Baltimore Ravens', 'Ravens', 'AFC', 'North'),
  ('CIN', 'cincinnati-bengals', 'Cincinnati Bengals', 'Bengals', 'AFC', 'North'),
  ('CLE', 'cleveland-browns', 'Cleveland Browns', 'Browns', 'AFC', 'North'),
  ('PIT', 'pittsburgh-steelers', 'Pittsburgh Steelers', 'Steelers', 'AFC', 'North'),
  ('HOU', 'houston-texans', 'Houston Texans', 'Texans', 'AFC', 'South'),
  ('IND', 'indianapolis-colts', 'Indianapolis Colts', 'Colts', 'AFC', 'South'),
  ('JAX', 'jacksonville-jaguars', 'Jacksonville Jaguars', 'Jaguars', 'AFC', 'South'),
  ('TEN', 'tennessee-titans', 'Tennessee Titans', 'Titans', 'AFC', 'South'),
  ('DEN', 'denver-broncos', 'Denver Broncos', 'Broncos', 'AFC', 'West'),
  ('KC',  'kansas-city-chiefs', 'Kansas City Chiefs', 'Chiefs', 'AFC', 'West'),
  ('LV',  'las-vegas-raiders', 'Las Vegas Raiders', 'Raiders', 'AFC', 'West'),
  ('LAC', 'los-angeles-chargers', 'Los Angeles Chargers', 'Chargers', 'AFC', 'West'),
  ('DAL', 'dallas-cowboys', 'Dallas Cowboys', 'Cowboys', 'NFC', 'East'),
  ('NYG', 'new-york-giants', 'New York Giants', 'Giants', 'NFC', 'East'),
  ('PHI', 'philadelphia-eagles', 'Philadelphia Eagles', 'Eagles', 'NFC', 'East'),
  ('WAS', 'washington-commanders', 'Washington Commanders', 'Commanders', 'NFC', 'East'),
  ('CHI', 'chicago-bears', 'Chicago Bears', 'Bears', 'NFC', 'North'),
  ('DET', 'detroit-lions', 'Detroit Lions', 'Lions', 'NFC', 'North'),
  ('GB',  'green-bay-packers', 'Green Bay Packers', 'Packers', 'NFC', 'North'),
  ('MIN', 'minnesota-vikings', 'Minnesota Vikings', 'Vikings', 'NFC', 'North'),
  ('ATL', 'atlanta-falcons', 'Atlanta Falcons', 'Falcons', 'NFC', 'South'),
  ('CAR', 'carolina-panthers', 'Carolina Panthers', 'Panthers', 'NFC', 'South'),
  ('NO',  'new-orleans-saints', 'New Orleans Saints', 'Saints', 'NFC', 'South'),
  ('TB',  'tampa-bay-buccaneers', 'Tampa Bay Buccaneers', 'Buccaneers', 'NFC', 'South'),
  ('ARI', 'arizona-cardinals', 'Arizona Cardinals', 'Cardinals', 'NFC', 'West'),
  ('LA',  'los-angeles-rams', 'Los Angeles Rams', 'Rams', 'NFC', 'West'),
  ('SF',  'san-francisco-49ers', 'San Francisco 49ers', '49ers', 'NFC', 'West'),
  ('SEA', 'seattle-seahawks', 'Seattle Seahawks', 'Seahawks', 'NFC', 'West');

insert into nfl.team_codes (code, franchise)
select franchise, franchise from nfl.franchises
union all values ('OAK', 'LV'), ('SD', 'LAC'), ('STL', 'LA');

-- ---------------------------------------------------------------------------
-- Writers (service_role only).
-- ---------------------------------------------------------------------------
create or replace function public.nfl_upsert_team_seasons(rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into nfl.team_seasons (season, code, full_name)
  select (r->>'season')::int, r->>'code', r->>'full_name'
  from jsonb_array_elements(rows) r
  on conflict (season, code) do update set full_name = excluded.full_name;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.nfl_upsert_games(rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into nfl.games as g (game_id, season, game_type, week, gameday, gametime, kickoff_at,
    away_code, home_code, away_score, home_score, overtime, neutral_site, div_game,
    spread_line, total_line, away_moneyline, home_moneyline, roof, surface, stadium,
    away_qb_name, home_qb_name, away_coach, home_coach, imported_at)
  select r->>'game_id', (r->>'season')::int, r->>'game_type', (r->>'week')::int,
    (r->>'gameday')::date, nullif(r->>'gametime', ''),
    case when nullif(r->>'gametime', '') is null then null
         else ((r->>'gameday') || ' ' || (r->>'gametime'))::timestamp at time zone 'America/New_York' end,
    r->>'away_code', r->>'home_code', (r->>'away_score')::int, (r->>'home_score')::int,
    (r->>'overtime')::boolean, coalesce((r->>'neutral_site')::boolean, false), coalesce((r->>'div_game')::boolean, false),
    (r->>'spread_line')::numeric, (r->>'total_line')::numeric,
    (r->>'away_moneyline')::int, (r->>'home_moneyline')::int,
    r->>'roof', r->>'surface', r->>'stadium', r->>'away_qb_name', r->>'home_qb_name',
    r->>'away_coach', r->>'home_coach', now()
  from jsonb_array_elements(rows) r
  on conflict (game_id) do update set
    season = excluded.season, game_type = excluded.game_type, week = excluded.week,
    gameday = excluded.gameday, gametime = excluded.gametime, kickoff_at = excluded.kickoff_at,
    away_code = excluded.away_code, home_code = excluded.home_code,
    away_score = excluded.away_score, home_score = excluded.home_score, overtime = excluded.overtime,
    neutral_site = excluded.neutral_site, div_game = excluded.div_game,
    spread_line = excluded.spread_line, total_line = excluded.total_line,
    away_moneyline = excluded.away_moneyline, home_moneyline = excluded.home_moneyline,
    roof = excluded.roof, surface = excluded.surface, stadium = excluded.stadium,
    away_qb_name = excluded.away_qb_name, home_qb_name = excluded.home_qb_name,
    away_coach = excluded.away_coach, home_coach = excluded.home_coach, imported_at = now()
  -- Never let a later file blank a score we already hold.
  where excluded.home_score is not null or g.home_score is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.nfl_upsert_team_seasons(jsonb) from public, anon, authenticated;
revoke all on function public.nfl_upsert_games(jsonb) from public, anon, authenticated;
grant execute on function public.nfl_upsert_team_seasons(jsonb) to service_role;
grant execute on function public.nfl_upsert_games(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Public read views.
-- ---------------------------------------------------------------------------
create view public.nfl_teams with (security_invoker = true) as
select franchise, slug, name, short_name, conference, division from nfl.franchises;

create view public.nfl_games with (security_invoker = true) as
select g.game_id, g.season, g.game_type, g.week, g.gameday, g.kickoff_at,
  ha.franchise as home_franchise, hf.slug as home_slug, coalesce(hs.full_name, hf.name) as home_name, hf.short_name as home_short,
  aa.franchise as away_franchise, af.slug as away_slug, coalesce(aws.full_name, af.name) as away_name, af.short_name as away_short,
  g.home_score, g.away_score, g.overtime, g.neutral_site, g.div_game,
  g.spread_line, g.total_line, g.stadium, g.roof, g.surface,
  g.home_qb_name, g.away_qb_name
from nfl.games g
join nfl.team_codes ha on ha.code = g.home_code
join nfl.franchises hf on hf.franchise = ha.franchise
join nfl.team_codes aa on aa.code = g.away_code
join nfl.franchises af on af.franchise = aa.franchise
left join nfl.team_seasons hs on hs.season = g.season and hs.code = g.home_code
left join nfl.team_seasons aws on aws.season = g.season and aws.code = g.away_code;

-- Regular-season record per franchise-season, plus how far it went in the
-- play-offs. Ordering inside a division is NOT the NFL's tiebreak procedure
-- (head-to-head, common games, strength of victory...); pages say so.
create view public.nfl_standings with (security_invoker = true) as
with sides as (
  select g.season, g.game_type, tc.franchise, g.home_code as code, g.home_score as pf, g.away_score as pa,
         true as is_home, g.div_game, ha.franchise as me, aa.franchise as opp
  from nfl.games g join nfl.team_codes tc on tc.code = g.home_code
  join nfl.team_codes ha on ha.code = g.home_code join nfl.team_codes aa on aa.code = g.away_code
  where g.home_score is not null
  union all
  select g.season, g.game_type, tc.franchise, g.away_code, g.away_score, g.home_score,
         false, g.div_game, aa.franchise, ha.franchise
  from nfl.games g join nfl.team_codes tc on tc.code = g.away_code
  join nfl.team_codes ha on ha.code = g.home_code join nfl.team_codes aa on aa.code = g.away_code
  where g.home_score is not null
),
reg as (
  select s.season, s.franchise, max(s.code) as code,
    count(*) as played,
    count(*) filter (where s.pf > s.pa) as won,
    count(*) filter (where s.pf < s.pa) as lost,
    count(*) filter (where s.pf = s.pa) as tied,
    sum(s.pf) as points_for, sum(s.pa) as points_against,
    count(*) filter (where s.is_home and s.pf > s.pa) as home_won,
    count(*) filter (where s.is_home and s.pf < s.pa) as home_lost,
    count(*) filter (where not s.is_home and s.pf > s.pa) as away_won,
    count(*) filter (where not s.is_home and s.pf < s.pa) as away_lost,
    count(*) filter (where s.div_game and s.pf > s.pa) as div_won,
    count(*) filter (where s.div_game and s.pf < s.pa) as div_lost,
    count(*) filter (where s.div_game and s.pf = s.pa) as div_tied,
    count(*) filter (where fo.conference = fm.conference and s.pf > s.pa) as conf_won,
    count(*) filter (where fo.conference = fm.conference and s.pf < s.pa) as conf_lost
  from sides s
  join nfl.franchises fm on fm.franchise = s.me
  join nfl.franchises fo on fo.franchise = s.opp
  where s.game_type = 'REG'
  group by s.season, s.franchise
),
post as (
  select season, franchise,
    max(case game_type when 'WC' then 1 when 'DIV' then 2 when 'CON' then 3 when 'SB' then 4 end) as round_reached,
    bool_or(game_type = 'SB' and pf > pa) as won_title
  from sides where game_type <> 'REG'
  group by season, franchise
),
seasons_done as (
  select season, bool_or(game_type = 'SB' and home_score is not null) as complete from nfl.games group by season
)
select r.season, f.franchise, f.slug, coalesce(ts.full_name, f.name) as team_name, f.short_name,
  f.conference, f.division,
  r.played, r.won, r.lost, r.tied,
  round((r.won + 0.5 * r.tied)::numeric / nullif(r.played, 0), 3) as win_pct,
  r.points_for, r.points_against, r.points_for - r.points_against as point_diff,
  r.home_won, r.home_lost, r.away_won, r.away_lost,
  r.div_won, r.div_lost, r.div_tied, r.conf_won, r.conf_lost,
  case when p.won_title then 'Won Super Bowl'
       when p.round_reached = 4 then 'Lost Super Bowl'
       when p.round_reached = 3 then 'Lost conference championship'
       when p.round_reached = 2 then 'Lost divisional round'
       when p.round_reached = 1 then 'Lost wild card round' end as playoff_result,
  coalesce(p.round_reached, 0) as playoff_round,
  coalesce(sd.complete, false) as season_complete,
  rank() over (partition by r.season, f.conference, f.division
               order by (r.won + 0.5 * r.tied)::numeric / nullif(r.played, 0) desc,
                        (r.div_won + 0.5 * r.div_tied)::numeric / nullif(r.div_won + r.div_lost + r.div_tied, 0) desc nulls last,
                        r.points_for - r.points_against desc) as division_rank
from reg r
join nfl.franchises f on f.franchise = r.franchise
left join nfl.team_seasons ts on ts.season = r.season and ts.code = r.code
left join post p on p.season = r.season and p.franchise = r.franchise
left join seasons_done sd on sd.season = r.season;

grant select on public.nfl_teams, public.nfl_games, public.nfl_standings to anon, authenticated, service_role;

comment on schema nfl is 'NFL phase 1 (Oct 2026): nflverse games and team names from 2002. Not exposed through the API; the site reads public.nfl_* views.';
comment on view public.nfl_games is 'NFL games from 2002 (nflverse games.csv) with franchise slugs and season-era team names. kickoff_at is UTC; spread_line is the closing line, + = home favoured.';
comment on view public.nfl_standings is 'NFL regular-season records per franchise-season with play-off result. division_rank orders by win %, division win %, points difference -- NOT the NFL tiebreak procedure.';

-- ---------------------------------------------------------------------------
-- Integrity checks, run daily by scripts/run_integrity_checks.py.
-- ---------------------------------------------------------------------------
create or replace function public.check_nfl_integrity()
returns table(check_name text, status text, found bigint, detail text)
language sql stable security definer set search_path = '' as $$
  -- Results feed stale: a game more than 2 days old with no score.
  select 'nfl_results_fresh', case when n = 0 then 'ok' else 'failed' end, n,
    'NFL games kicked off more than 2 days ago still without a score'
  from (select count(*) n from nfl.games where kickoff_at < now() - interval '2 days' and home_score is null) x
  union all
  -- Every complete regular season: 32 teams, 17 games (16 before 2021), all
  -- games counted twice in the standings.
  select 'nfl_standings_complete', case when n = 0 then 'ok' else 'failed' end, n,
    'Complete NFL seasons whose standings do not have 32 teams each with the full regular-season schedule'
  from (select count(*) n from (
          select s.season from public.nfl_standings s where s.season_complete
          group by s.season
          having count(*) <> 32
              or count(*) filter (where s.played + case when s.season = 2022 and s.franchise in ('BUF', 'CIN') then 1 else 0 end
                                    <> case when s.season >= 2021 then 17 else 16 end) > 0) y) x
  union all
  -- A game whose code is unmapped would silently vanish from every view.
  select 'nfl_games_mapped', case when n = 0 then 'ok' else 'failed' end, n,
    'NFL games missing from public.nfl_games (unmapped team code)'
  from (select (select count(*) from nfl.games) - (select count(*) from public.nfl_games) n) x
$$;
revoke all on function public.check_nfl_integrity() from public, anon, authenticated;
grant execute on function public.check_nfl_integrity() to service_role;

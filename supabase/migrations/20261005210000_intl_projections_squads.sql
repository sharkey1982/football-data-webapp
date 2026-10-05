-- ============================================================================
-- International: projections and squads (5 Oct 2026).
--
-- Projections (model IP1, scripts/intl_projections.py, run by the daily
-- import):
--   intl.model_info      the fitted parameters, one row per model
--   intl.projections     win/draw/loss, expected goals and the five likeliest
--                        scores for every unplayed fixture
--   intl.group_odds      Nations League league phase, simulated 10,000 times:
--                        each team's chance of finishing in each position
--   public.intl_fixtures now carries the projection columns
--
-- Squads (scripts/intl_squads.py, daily, from each national team's Wikipedia
-- page, CC BY-SA):
--   intl.squads          one row per nation: page, revision time, the intro
--                        ("named for the matches against..."), caps as of
--   intl.squad_players   the current squad and recent call-ups
-- ============================================================================

create table intl.model_info (
  model text primary key,
  params jsonb not null,
  fitted_through int not null,
  updated_at timestamptz not null default now()
);

create table intl.projections (
  fixture_key text primary key references intl.fixtures(fixture_key) on delete cascade,
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

create table intl.group_odds (
  edition_key text not null references intl.editions(edition_key) on delete cascade,
  group_label text not null,
  team text not null references intl.teams(team),
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

create table intl.squads (
  team text primary key references intl.teams(team) on delete cascade,
  wiki_title text not null,
  revision_at timestamptz,
  intro text,
  caps_as_of text,
  players int not null,
  fetched_at timestamptz not null default now()
);

create table intl.squad_players (
  team text not null references intl.squads(team) on delete cascade,
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

alter table intl.model_info enable row level security;
alter table intl.projections enable row level security;
alter table intl.group_odds enable row level security;
alter table intl.squads enable row level security;
alter table intl.squad_players enable row level security;
create policy "public read" on intl.model_info for select to anon, authenticated using (true);
create policy "public read" on intl.projections for select to anon, authenticated using (true);
create policy "public read" on intl.group_odds for select to anon, authenticated using (true);
create policy "public read" on intl.squads for select to anon, authenticated using (true);
create policy "public read" on intl.squad_players for select to anon, authenticated using (true);
grant select on intl.model_info, intl.projections, intl.group_odds, intl.squads, intl.squad_players to anon, authenticated;
grant all on intl.model_info, intl.projections, intl.group_odds, intl.squads, intl.squad_players to service_role;

-- ---------------------------------------------------------------------------
-- Writers (service_role only).
-- ---------------------------------------------------------------------------

create or replace function public.intl_replace_projections(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into intl.model_info (model, params, fitted_through, updated_at)
  select payload->'model'->>'model', payload->'model'->'params', (payload->'model'->>'fitted_through')::int, now()
  on conflict (model) do update set params = excluded.params, fitted_through = excluded.fitted_through, updated_at = now();

  delete from intl.projections where true;
  insert into intl.projections (fixture_key, model, elo_home, elo_away, p_home, p_draw, p_away, xg_home, xg_away, scores)
  select r->>'fixture_key', r->>'model', (r->>'elo_home')::numeric, (r->>'elo_away')::numeric,
         (r->>'p_home')::numeric, (r->>'p_draw')::numeric, (r->>'p_away')::numeric,
         (r->>'xg_home')::numeric, (r->>'xg_away')::numeric, r->'scores'
  from jsonb_array_elements(payload->'projections') r
  where exists (select 1 from intl.fixtures f where f.fixture_key = r->>'fixture_key');

  delete from intl.group_odds where true;
  insert into intl.group_odds (edition_key, group_label, team, played, points, gd, gf, p_pos, exp_points, sims)
  select r->>'edition_key', r->>'group_label', r->>'team', (r->>'played')::int, (r->>'points')::int,
         (r->>'gd')::int, (r->>'gf')::int, array(select jsonb_array_elements_text(r->'p_pos')::numeric),
         (r->>'exp_points')::numeric, (r->>'sims')::int
  from jsonb_array_elements(payload->'group_odds') r;
end $$;

-- Replaces the squads of the nations in the payload; other nations keep theirs
-- (a page that fails to parse never wipes a squad).
create or replace function public.intl_replace_squads(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intl.squads s
  where s.team in (select r->>'team' from jsonb_array_elements(payload->'squads') r);
  insert into intl.squads (team, wiki_title, revision_at, intro, caps_as_of, players)
  select r->>'team', r->>'wiki_title', (r->>'revision_at')::timestamptz, r->>'intro', r->>'caps_as_of', (r->>'players')::int
  from jsonb_array_elements(payload->'squads') r;
  insert into intl.squad_players (team, list, seq, number, position, player, wiki_title, birth_date, caps, goals,
                                  club, club_country, latest_date, latest_text, status)
  select r->>'team', r->>'list', (r->>'seq')::int, (r->>'number')::int, r->>'position', r->>'player', r->>'wiki_title',
         (r->>'birth_date')::date, (r->>'caps')::int, (r->>'goals')::int, r->>'club', r->>'club_country',
         (r->>'latest_date')::date, r->>'latest_text', r->>'status'
  from jsonb_array_elements(payload->'players') r;
end $$;

revoke all on function public.intl_replace_projections(jsonb) from public, anon, authenticated;
revoke all on function public.intl_replace_squads(jsonb) from public, anon, authenticated;
grant execute on function public.intl_replace_projections(jsonb) to service_role;
grant execute on function public.intl_replace_squads(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Views.
-- ---------------------------------------------------------------------------

create or replace view public.intl_fixtures with (security_invoker = true) as
select f.fixture_key, f.edition_key, f.kickoff_utc, f.home_team, ht.slug as home_slug, f.away_team,
       awt.slug as away_slug, f.group_label, f.round_number, f.venue,
       coalesce(m.home_score, f.home_score) as home_score, coalesce(m.away_score, f.away_score) as away_score,
       m.match_key,
       p.p_home, p.p_draw, p.p_away, p.xg_home, p.xg_away, p.scores
from intl.fixtures f
join intl.teams ht on ht.team = f.home_team
join intl.teams awt on awt.team = f.away_team
left join intl.matches m on m.home_team = f.home_team and m.away_team = f.away_team
  and m.match_date between (f.kickoff_utc at time zone 'Europe/London')::date - 1
                       and (f.kickoff_utc at time zone 'Europe/London')::date + 1
left join intl.projections p on p.fixture_key = f.fixture_key;

create view public.intl_group_odds with (security_invoker = true) as
select o.edition_key, o.group_label, o.team, t.slug, o.played, o.points, o.gd, o.gf, o.p_pos, o.exp_points, o.sims, o.updated_at
from intl.group_odds o join intl.teams t on t.team = o.team;

create view public.intl_squads with (security_invoker = true) as
select s.team, t.slug, s.wiki_title, s.revision_at, s.intro, s.caps_as_of, s.players, s.fetched_at
from intl.squads s join intl.teams t on t.team = s.team;

create view public.intl_squad_players with (security_invoker = true) as
select p.team, t.slug, p.list, p.seq, p.number, p.position, p.player, p.wiki_title, p.birth_date, p.caps, p.goals,
       p.club, p.club_country, p.latest_date, p.latest_text, p.status
from intl.squad_players p join intl.teams t on t.team = p.team;

grant select on public.intl_fixtures, public.intl_group_odds, public.intl_squads, public.intl_squad_players to anon, authenticated;

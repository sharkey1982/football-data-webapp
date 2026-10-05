-- ============================================================================
-- International: where squad players play (5 Oct 2026).
--
-- scripts/intl_squads.py now matches each player's club (Wikipedia wikilink +
-- the FIFA code of its league country) to:
--   * the league country's name                  -> club_league_country
--   * the FixtureShark club page (public.teams)   -> club_slug
--   * ClubElo (api.clubelo.com, mainly Europe)    -> clubelo_name, club_elo, club_elo_rank
-- and stores the day's ClubElo table (intl.club_elo) for the world club list.
--
-- Views:
--   intl_squad_players   gains the columns above
--   intl_club_callups    clubs by internationals in current squads
--   intl_league_exports  league countries by internationals they hold
--   intl_club_elo        the ClubElo table with each club's internationals
--   intl_squad_club_strength  each squad: at home / abroad, average club rating
--
-- Also: intl.group_odds.zones (Nations League quarter-finals / promotion /
-- play-off / relegation chances) and its writer and view.
-- ============================================================================

alter table intl.squad_players add column if not exists club_wiki text;
alter table intl.squad_players add column if not exists club_league_country text;
alter table intl.squad_players add column if not exists club_slug text;
alter table intl.squad_players add column if not exists clubelo_name text;
alter table intl.squad_players add column if not exists club_elo numeric;
alter table intl.squad_players add column if not exists club_elo_rank int;

create index if not exists intl_squad_players_clubelo_idx on intl.squad_players (clubelo_name);

create table intl.club_elo (
  club text primary key,                    -- ClubElo's name
  country text,                             -- ClubElo's country code
  level int,                                -- league tier
  elo numeric not null,
  rank int not null,                        -- among every club in the table
  club_slug text,                           -- FixtureShark club page, when we have it
  fetched_on date not null
);
alter table intl.club_elo enable row level security;
create policy "public read" on intl.club_elo for select to anon, authenticated using (true);
grant select on intl.club_elo to anon, authenticated;
grant all on intl.club_elo to service_role;

create or replace function public.intl_replace_squads(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intl.squads s
  where s.team in (select r->>'team' from jsonb_array_elements(payload->'squads') r);
  insert into intl.squads (team, wiki_title, revision_at, intro, caps_as_of, players)
  select r->>'team', r->>'wiki_title', (r->>'revision_at')::timestamptz, r->>'intro', r->>'caps_as_of', (r->>'players')::int
  from jsonb_array_elements(payload->'squads') r;
  insert into intl.squad_players (team, list, seq, number, position, player, wiki_title, birth_date, caps, goals,
                                  club, club_country, latest_date, latest_text, status,
                                  club_wiki, club_league_country, club_slug, clubelo_name, club_elo, club_elo_rank)
  select r->>'team', r->>'list', (r->>'seq')::int, (r->>'number')::int, r->>'position', r->>'player', r->>'wiki_title',
         (r->>'birth_date')::date, (r->>'caps')::int, (r->>'goals')::int, r->>'club', r->>'club_country',
         (r->>'latest_date')::date, r->>'latest_text', r->>'status',
         r->>'club_wiki', r->>'club_league_country', r->>'club_slug', r->>'clubelo_name',
         (r->>'club_elo')::numeric, (r->>'club_elo_rank')::int
  from jsonb_array_elements(payload->'players') r;
end $$;

create or replace function public.intl_replace_club_elo(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_array_length(payload) < 100 then
    raise exception 'ClubElo table too short (% rows) -- keeping the stored one', jsonb_array_length(payload);
  end if;
  delete from intl.club_elo where true;
  insert into intl.club_elo (club, country, level, elo, rank, club_slug, fetched_on)
  select r->>'club', r->>'country', (r->>'level')::int, (r->>'elo')::numeric, (r->>'rank')::int, r->>'club_slug',
         (r->>'fetched_on')::date
  from jsonb_array_elements(payload) r
  on conflict (club) do nothing;
end $$;

revoke all on function public.intl_replace_squads(jsonb) from public, anon, authenticated;
revoke all on function public.intl_replace_club_elo(jsonb) from public, anon, authenticated;
grant execute on function public.intl_replace_squads(jsonb) to service_role;
grant execute on function public.intl_replace_club_elo(jsonb) to service_role;

create or replace view public.intl_squad_players with (security_invoker = true) as
select p.team, t.slug, p.list, p.seq, p.number, p.position, p.player, p.wiki_title, p.birth_date, p.caps, p.goals,
       p.club, p.club_country, p.latest_date, p.latest_text, p.status,
       p.club_wiki, p.club_league_country, p.club_slug, p.clubelo_name, p.club_elo, p.club_elo_rank
from intl.squad_players p join intl.teams t on t.team = p.team;

-- Clubs by internationals in the current squads (one row per club).
create view public.intl_club_callups with (security_invoker = true) as
select coalesce(p.club_wiki, p.club) as club_key, min(p.club) as club, min(p.club_league_country) as league_country,
       min(p.club_slug) as club_slug, max(p.club_elo) as club_elo, min(p.club_elo_rank) as club_elo_rank,
       count(*) as players, count(distinct p.team) as nations,
       jsonb_agg(jsonb_build_object('team', p.team, 'slug', t.slug, 'player', p.player, 'caps', p.caps)
                 order by p.team, p.caps desc nulls last) as callups
from intl.squad_players p join intl.teams t on t.team = p.team
where p.list = 'current' and p.club is not null
group by coalesce(p.club_wiki, p.club);

-- League countries by internationals playing there.
create view public.intl_league_exports with (security_invoker = true) as
select p.club_league_country as league_country, count(*) as players, count(distinct p.team) as nations,
       count(distinct coalesce(p.club_wiki, p.club)) as clubs,
       count(*) filter (where p.team <> p.club_league_country) as foreign_players
from intl.squad_players p
where p.list = 'current' and p.club_league_country is not null
group by p.club_league_country;

create view public.intl_club_elo with (security_invoker = true) as
select e.club, e.country, e.level, e.elo, e.rank, e.club_slug, e.fetched_on,
       (select count(*) from intl.squad_players p where p.list = 'current' and p.clubelo_name = e.club) as internationals
from intl.club_elo e;

-- Each nation's current squad by where its players play: at home or abroad,
-- and the average ClubElo rating of the clubs that are rated.
create view public.intl_squad_club_strength with (security_invoker = true) as
select p.team, t.slug, ts.confederation, count(*) as players,
       count(*) filter (where p.club_league_country = p.team) as at_home,
       count(*) filter (where p.club_league_country is not null and p.club_league_country <> p.team) as abroad,
       count(p.club_elo) as rated, round(avg(p.club_elo), 0) as avg_club_elo,
       count(distinct p.club_league_country) as league_countries
from intl.squad_players p
join intl.teams t on t.team = p.team
left join intl.team_summary ts on ts.team = p.team
where p.list = 'current'
group by p.team, t.slug, ts.confederation;

grant select on public.intl_squad_players, public.intl_club_callups, public.intl_league_exports, public.intl_club_elo,
  public.intl_squad_club_strength to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Nations League zones: what each team's simulated finish leads to
-- (quarter-finals, promotion, play-offs, relegation), from intl_projections.
-- ---------------------------------------------------------------------------

alter table intl.group_odds add column if not exists zones jsonb not null default '{}';

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
  insert into intl.group_odds (edition_key, group_label, team, played, points, gd, gf, p_pos, exp_points, sims, zones)
  select r->>'edition_key', r->>'group_label', r->>'team', (r->>'played')::int, (r->>'points')::int,
         (r->>'gd')::int, (r->>'gf')::int, array(select jsonb_array_elements_text(r->'p_pos')::numeric),
         (r->>'exp_points')::numeric, (r->>'sims')::int, coalesce(r->'zones', '{}'::jsonb)
  from jsonb_array_elements(payload->'group_odds') r;
end $$;

revoke all on function public.intl_replace_projections(jsonb) from public, anon, authenticated;
grant execute on function public.intl_replace_projections(jsonb) to service_role;

create or replace view public.intl_group_odds with (security_invoker = true) as
select o.edition_key, o.group_label, o.team, t.slug, o.played, o.points, o.gd, o.gf, o.p_pos, o.exp_points, o.sims, o.updated_at,
       o.zones
from intl.group_odds o join intl.teams t on t.team = o.team;

grant select on public.intl_group_odds to anon, authenticated;

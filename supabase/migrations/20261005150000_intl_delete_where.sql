-- ============================================================================
-- International import fix (5 Oct 2026). Supabase's pg_safeupdate guard
-- refuses a DELETE without a WHERE clause when it arrives through the API, so
-- the first intl_import run failed in intl_load_reference with "DELETE requires
-- a WHERE clause" (the local Postgres used for testing has no such guard).
-- The full-table clears now say "where true". Bodies otherwise unchanged.
-- ============================================================================

create or replace function public.intl_load_reference(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into intl.teams (team, slug, confederation, first_match, last_match, matches)
  select r->>'team', r->>'slug', r->>'confederation', (r->>'first_match')::date, (r->>'last_match')::date,
         (r->>'matches')::int
  from jsonb_array_elements(payload->'teams') r
  on conflict (team) do update set slug = excluded.slug, confederation = excluded.confederation,
    first_match = excluded.first_match, last_match = excluded.last_match, matches = excluded.matches;

  delete from intl.team_names where true;
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

  delete from intl.group_members where true;
  insert into intl.group_members (group_key, team)
  select r->>'group_key', r->>'team' from jsonb_array_elements(payload->'group_members') r;
end $$;

create or replace function public.intl_replace_shootouts(rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intl.shootouts where true;
  insert into intl.shootouts (match_key, winner, first_shooter)
  select r->>'match_key', r->>'winner', r->>'first_shooter' from jsonb_array_elements(rows) r;
end $$;

create or replace function public.intl_refresh()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intl.team_competition_totals where true;
  insert into intl.team_competition_totals
  select team, competition, count(*), count(*) filter (where gf > ga), count(*) filter (where gf = ga),
         count(*) filter (where gf < ga), sum(gf), sum(ga), min(match_date), max(match_date)
  from (select home_team team, competition, home_score gf, away_score ga, match_date from intl.matches
        union all
        select away_team, competition, away_score, home_score, match_date from intl.matches) s
  group by team, competition;

  delete from intl.pair_records where true;
  insert into intl.pair_records
  select a, b, count(*), count(*) filter (where ag > bg), count(*) filter (where ag = bg),
         count(*) filter (where ag < bg), sum(ag), sum(bg), min(match_date), max(match_date)
  from (select least(home_team, away_team) a, greatest(home_team, away_team) b,
               case when home_team < away_team then home_score else away_score end ag,
               case when home_team < away_team then away_score else home_score end bg, match_date
        from intl.matches) s
  group by a, b;
end $$;

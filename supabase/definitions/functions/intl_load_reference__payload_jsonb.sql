-- Live definition exported from the database (function intl_load_reference(payload jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.intl_load_reference(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

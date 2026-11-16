-- Live definition exported from the database (function nfl_upsert_players(rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.nfl_upsert_players(rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  insert into nfl.players as p (player_id, slug, name, position, position_group, latest_team, birth_date,
    height_in, weight_lb, college, rookie_season, draft_year, draft_round, draft_pick, draft_team,
    jersey_number, status, years_exp, imported_at)
  select r->>'player_id', r->>'slug', r->>'name', r->>'position', r->>'position_group', r->>'latest_team',
    (r->>'birth_date')::date, (r->>'height_in')::int, (r->>'weight_lb')::int, r->>'college',
    (r->>'rookie_season')::int, (r->>'draft_year')::int, (r->>'draft_round')::int, (r->>'draft_pick')::int,
    r->>'draft_team', (r->>'jersey_number')::int, r->>'status', (r->>'years_exp')::int, now()
  from jsonb_array_elements(rows) r
  on conflict (player_id) do update set
    name = excluded.name, position = coalesce(excluded.position, p.position),
    position_group = coalesce(excluded.position_group, p.position_group),
    latest_team = coalesce(excluded.latest_team, p.latest_team), birth_date = coalesce(excluded.birth_date, p.birth_date),
    height_in = coalesce(excluded.height_in, p.height_in), weight_lb = coalesce(excluded.weight_lb, p.weight_lb),
    college = coalesce(excluded.college, p.college), rookie_season = coalesce(excluded.rookie_season, p.rookie_season),
    draft_year = coalesce(excluded.draft_year, p.draft_year), draft_round = coalesce(excluded.draft_round, p.draft_round),
    draft_pick = coalesce(excluded.draft_pick, p.draft_pick), draft_team = coalesce(excluded.draft_team, p.draft_team),
    jersey_number = coalesce(excluded.jersey_number, p.jersey_number), status = coalesce(excluded.status, p.status),
    years_exp = coalesce(excluded.years_exp, p.years_exp), imported_at = now();
  get diagnostics n = row_count;
  return n;
end $function$
;

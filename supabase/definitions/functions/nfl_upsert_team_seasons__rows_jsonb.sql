-- Live definition exported from the database (function nfl_upsert_team_seasons(rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.nfl_upsert_team_seasons(rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  insert into nfl.team_seasons (season, code, full_name)
  select (r->>'season')::int, r->>'code', r->>'full_name'
  from jsonb_array_elements(rows) r
  on conflict (season, code) do update set full_name = excluded.full_name;
  get diagnostics n = row_count;
  return n;
end $function$
;

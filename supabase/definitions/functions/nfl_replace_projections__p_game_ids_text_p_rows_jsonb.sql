-- Live definition exported from the database (function nfl_replace_projections(p_game_ids text[], p_rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.nfl_replace_projections(p_game_ids text[], p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  delete from nfl.projections where game_id = any (p_game_ids);
  insert into nfl.projections
  select (jsonb_populate_record(null::nfl.projections, r || jsonb_build_object('computed_at', now()))).*
  from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  return n;
end $function$
;

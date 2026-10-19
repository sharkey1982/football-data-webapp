-- Live definition exported from the database (function nfl_replace_depth_daily(p_days date[], rows jsonb, p_first boolean)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.nfl_replace_depth_daily(p_days date[], rows jsonb, p_first boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  if p_first then delete from nfl.depth_daily where as_of = any (p_days); end if;
  insert into nfl.depth_daily
  select (jsonb_populate_record(null::nfl.depth_daily, r || jsonb_build_object('imported_at', now()))).*
  from jsonb_array_elements(rows) r
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $function$
;

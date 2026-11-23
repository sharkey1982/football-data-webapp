-- Live definition exported from the database (function intl_delete_matches(keys jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.intl_delete_matches(keys jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  delete from intl.matches where match_key in (select jsonb_array_elements_text(keys));
  get diagnostics n = row_count;
  return n;
end $function$
;

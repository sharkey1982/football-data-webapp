-- Live definition exported from the database (function intlw_replace_shootouts(rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.intlw_replace_shootouts(rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  delete from intlw.shootouts where true;
  insert into intlw.shootouts (match_key, winner, first_shooter)
  select r->>'match_key', r->>'winner', r->>'first_shooter' from jsonb_array_elements(rows) r;
end $function$
;

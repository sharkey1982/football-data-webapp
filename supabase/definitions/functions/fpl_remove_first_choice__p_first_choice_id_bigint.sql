-- Live definition exported from the database (function fpl_remove_first_choice(p_first_choice_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_remove_first_choice(p_first_choice_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public._require_admin();
  update public.fpl_player_first_choice set removed_at = now()
   where first_choice_id = p_first_choice_id and removed_at is null;
end $function$
;

-- Live definition exported from the database (function fpl_set_first_choice(p_fpl_player_id bigint, p_start_if_fit numeric, p_from date, p_to date, p_note text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_set_first_choice(p_fpl_player_id bigint, p_start_if_fit numeric, p_from date DEFAULT CURRENT_DATE, p_to date DEFAULT NULL::date, p_note text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id bigint;
begin
  perform public._require_admin();
  if p_start_if_fit is null or p_start_if_fit <= 0 or p_start_if_fit > 0.98 then
    raise exception 'start chance if fit must be above 0 and at most 0.98';
  end if;
  -- One setting in force per player: a new one replaces the old.
  update public.fpl_player_first_choice set removed_at = now()
   where fpl_player_id = p_fpl_player_id and removed_at is null;
  insert into public.fpl_player_first_choice (fpl_player_id, start_if_fit, effective_from, effective_to, note)
  values (p_fpl_player_id, p_start_if_fit, coalesce(p_from, current_date), p_to, nullif(trim(p_note), ''))
  returning first_choice_id into v_id;
  return v_id;
end $function$
;

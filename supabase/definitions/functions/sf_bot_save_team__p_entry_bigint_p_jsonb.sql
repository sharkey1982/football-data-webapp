-- Live definition exported from the database (function sf_bot_save_team(p_entry bigint, p jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.sf_bot_save_team(p_entry bigint, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (select 1 from sf.entries e join sf.fantasy_managers m on m.id = e.manager_id where e.id = p_entry and m.is_bot) then
    raise exception 'not a bot entry';
  end if;
  return sf.save_team(p_entry, p, false);
end $function$
;

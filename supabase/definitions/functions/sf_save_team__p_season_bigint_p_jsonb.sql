-- Live definition exported from the database (function sf_save_team(p_season bigint, p jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.sf_save_team(p_season bigint, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e bigint;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not sf.season_visible(p_season) then raise exception 'not available'; end if;
  select en.id into e from sf.entries en join sf.fantasy_managers m on m.id = en.manager_id
  where m.user_id = auth.uid() and en.season_id = p_season;
  if e is null then raise exception 'join the season first'; end if;
  return sf.save_team(e, p, true);
end $function$
;

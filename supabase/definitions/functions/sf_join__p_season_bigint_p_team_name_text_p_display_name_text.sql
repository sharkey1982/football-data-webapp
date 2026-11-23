-- Live definition exported from the database (function sf_join(p_season bigint, p_team_name text, p_display_name text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.sf_join(p_season bigint, p_team_name text, p_display_name text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m bigint; e bigint; r int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not sf.season_visible(p_season) then raise exception 'not available'; end if;
  r := sf.open_round(p_season);
  if r is null then raise exception 'joining opens again after the results'; end if;
  insert into sf.fantasy_managers (user_id, display_name)
  values (auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Manager'))
  on conflict (user_id) do nothing;
  select id into m from sf.fantasy_managers where user_id = auth.uid();
  insert into sf.entries (manager_id, season_id, team_name, joined_round, bank)
  values (m, p_season, trim(p_team_name), r, 0)
  on conflict (manager_id, season_id) do nothing;
  select id into e from sf.entries where manager_id = m and season_id = p_season;
  insert into sf.league_members (league_id, entry_id)
  select l.id, e from sf.leagues l where l.season_id = p_season and l.kind = 'public' on conflict do nothing;
  return e;
end $function$
;

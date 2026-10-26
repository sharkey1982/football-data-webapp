-- Live definition exported from the database (function sf_ensure_bot(p_season bigint, p_kind text, p_key text, p_name text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.sf_ensure_bot(p_season bigint, p_kind text, p_key text, p_name text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m bigint; e bigint; r int;
begin
  insert into sf.fantasy_managers (display_name, is_bot, bot_kind, bot_key) values (p_name, true, p_kind, p_key)
  on conflict (bot_key) do nothing;
  select id into m from sf.fantasy_managers where bot_key = p_key;
  select id into e from sf.entries where manager_id = m and season_id = p_season;
  if e is null then
    r := sf.open_round(p_season);
    if r is null then raise exception 'no open round'; end if;
    insert into sf.entries (manager_id, season_id, team_name, joined_round) values (m, p_season, p_name, r) returning id into e;
    insert into sf.league_members (league_id, entry_id)
    select l.id, e from sf.leagues l where l.season_id = p_season and l.kind = 'public' on conflict do nothing;
  end if;
  return e;
end $function$
;

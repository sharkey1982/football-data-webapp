-- Live definition exported from the database (function penalty_match_player(p_team bigint, p_name text, p_season bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.penalty_match_player(p_team bigint, p_name text, p_season bigint DEFAULT 13)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with n as (select lower(public.unaccent(coalesce(p_name, ''))) nm),
  c as (
    select p.fpl_player_id,
           lower(public.unaccent(coalesce(p.source_payload->>'first_name', ''))) fn,
           lower(public.unaccent(coalesce(p.source_payload->>'first_name', '') || ' ' || coalesce(p.source_payload->>'second_name', ''))) full_name,
           lower(public.unaccent(coalesce(nullif(p.source_payload->>'known_name', ''), '~'))) known,
           lower(public.unaccent(coalesce(p.source_payload->>'second_name', '~'))) sn,
           lower(public.unaccent(regexp_replace(coalesce(p.web_name, '~'), '^.*\.', ''))) wn,
           coalesce((p.source_payload->>'minutes')::int, 0) mins
      from public.fpl_players p where p.season_id = p_season and p.canonical_team_id = p_team)
  select c.fpl_player_id from c, n
   where n.nm <> '' and (n.nm = c.full_name or n.nm = c.known or n.nm = c.sn or n.nm like '% ' || c.sn
          or n.nm = c.wn or n.nm like '% ' || c.wn
          or replace(n.nm, ' ', '') = replace(c.full_name, ' ', '')
          or n.nm = c.fn || ' ' || split_part(c.sn, ' ', 1)
          or c.full_name like '% ' || split_part(n.nm, ' ', array_length(string_to_array(n.nm, ' '), 1)))
   order by case when n.nm = c.full_name or replace(n.nm, ' ', '') = replace(c.full_name, ' ', '') then 0
                 when n.nm = c.known or n.nm = c.fn || ' ' || split_part(c.sn, ' ', 1) then 1
                 when n.nm = c.sn or n.nm like '% ' || c.sn then 2
                 when n.nm = c.wn or n.nm like '% ' || c.wn then 3 else 4 end, c.mins desc
   limit 1
$function$
;

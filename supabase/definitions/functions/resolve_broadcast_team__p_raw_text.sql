-- Live definition exported from the database (function resolve_broadcast_team(p_raw text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.resolve_broadcast_team(p_raw text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with c as (
    select 1 lvl, team_id from public.team_aliases where source_name = 'Airtable' and raw_name = p_raw
    union all select 2, team_id from public.teams where lower(canonical_name) = lower(p_raw) or lower(display_name) = lower(p_raw)
    union all select 3, team_id from public.team_aliases where raw_name = p_raw
  ), lv as (
    select lvl, min(team_id) team_id, count(distinct team_id) n from c group by lvl
  )
  select team_id from lv where n = 1 order by lvl limit 1;
$function$
;

-- Live definition exported from the database (function ai_resolve_team(p_name text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_resolve_team(p_name text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with q as (select trim(public.ai_norm(p_name)) n),
  cand as (
    select t.team_id, t.display_name, c.name country, 1 rank
      from teams t left join countries c using (country_id), q
     where trim(public.ai_norm(t.display_name)) = q.n or trim(public.ai_norm(t.canonical_name)) = q.n
    union
    select t.team_id, t.display_name, c.name, 2
      from team_aliases a join teams t using (team_id) left join countries c on c.country_id = t.country_id, q
     where trim(public.ai_norm(a.raw_name)) = q.n
    union
    select t.team_id, t.display_name, c.name, 3
      from teams t left join countries c using (country_id), q
     where length(q.n) >= 3 and (public.ai_norm(t.display_name) like q.n || '%' or public.ai_norm(t.canonical_name) like '%' || q.n || '%')
  ),
  best as (select * from cand where rank = (select min(rank) from cand)),
  dedup as (select distinct on (team_id) team_id, display_name, country from best order by team_id)
  select case
    when (select count(*) from dedup) = 1 then (select jsonb_build_object('team_id', team_id, 'team', display_name, 'country', country) from dedup)
    when (select count(*) from dedup) = 0 then jsonb_build_object('error', 'No team matches "' || p_name || '".')
    else jsonb_build_object('error', 'More than one team matches "' || p_name || '". Use find_entity and pick one.',
                            'candidates', (select jsonb_agg(jsonb_build_object('team_id', team_id, 'team', display_name, 'country', country)) from dedup))
  end
$function$
;

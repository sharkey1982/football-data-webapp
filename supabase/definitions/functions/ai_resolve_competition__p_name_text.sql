-- Live definition exported from the database (function ai_resolve_competition(p_name text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_resolve_competition(p_name text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with q as (select trim(public.ai_norm(p_name)) n),
  cand as (
    select l.league_id, l.name, l.code, c.name country, 1 rank
      from leagues l left join countries c using (country_id), q
     where trim(public.ai_norm(l.name)) = q.n or lower(l.code) = q.n or trim(public.ai_norm(l.slug)) = q.n
    union
    select l.league_id, l.name, l.code, c.name, 2
      from leagues l left join countries c using (country_id), q
     where length(q.n) >= 3 and public.ai_norm(l.name) like '%' || q.n || '%'
  ),
  best as (select * from cand where rank = (select min(rank) from cand))
  select case
    when (select count(*) from best) = 1 then (select jsonb_build_object('league_id', league_id, 'competition', name, 'code', code, 'country', country) from best)
    when (select count(*) from best) = 0 then jsonb_build_object('error', 'No competition matches "' || p_name || '".')
    else jsonb_build_object('error', 'More than one competition matches "' || p_name || '".',
                            'candidates', (select jsonb_agg(jsonb_build_object('competition', name, 'code', code, 'country', country)) from best))
  end
$function$
;

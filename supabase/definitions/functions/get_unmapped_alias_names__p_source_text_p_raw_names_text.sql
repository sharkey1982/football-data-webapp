-- Live definition exported from the database (function get_unmapped_alias_names(p_source text, p_raw_names text[])).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_unmapped_alias_names(p_source text, p_raw_names text[])
 RETURNS TABLE(raw_name text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select rn from unnest(p_raw_names) as rn
  where not exists (
    select 1 from team_aliases ta where ta.source_name = p_source and ta.raw_name = rn
  )
  order by rn;
$function$
;

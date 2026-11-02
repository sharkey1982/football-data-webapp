-- Live definition exported from the database (function fpl_defcon_rate90(p_element_type integer, p_minutes numeric, p_count numeric)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_defcon_rate90(p_element_type integer, p_minutes numeric, p_count numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select (coalesce(p_count, 0) + 3 * mu) / (coalesce(p_minutes, 0) / 90 + 3)
    from (select case p_element_type when 2 then 7.762450 when 3 then 8.609387 when 4 then 4.615626 end as mu) x
$function$
;

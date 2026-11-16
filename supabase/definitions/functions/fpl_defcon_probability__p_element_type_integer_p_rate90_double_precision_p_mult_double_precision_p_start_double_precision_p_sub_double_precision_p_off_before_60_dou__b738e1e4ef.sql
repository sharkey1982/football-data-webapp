-- Live definition exported from the database (function fpl_defcon_probability(p_element_type integer, p_rate90 double precision, p_mult double precision, p_start double precision, p_sub double precision, p_off_before_60 double precision, p_off_60_84 double precision, p_full double precision)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_defcon_probability(p_element_type integer, p_rate90 double precision, p_mult double precision, p_start double precision, p_sub double precision, p_off_before_60 double precision, p_off_60_84 double precision, p_full double precision)
 RETURNS double precision
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t integer;
  phi double precision;
  m90 double precision;
  early double precision := 0;
  mid double precision := 0;
  sub double precision := 0;
  full_ double precision;
  eb double precision;
  m integer;
begin
  if p_element_type is null or p_element_type not in (2, 3, 4) or p_rate90 is null then
    return 0;
  end if;
  t := case when p_element_type = 2 then 10 else 12 end;
  phi := case p_element_type when 2 then 13.212545 when 3 then 16.467383 else 9.326230 end;
  m90 := p_rate90 * coalesce(p_mult, 1) / 90;
  foreach m in array array[32, 45, 45, 56, 59] loop early := early + public.fpl_nb_upper_tail(t, m90 * m, phi) / 5; end loop;
  foreach m in array array[62, 68, 73, 78, 82] loop mid := mid + public.fpl_nb_upper_tail(t, m90 * m, phi) / 5; end loop;
  foreach m in array array[2, 9, 16, 24, 37] loop sub := sub + public.fpl_nb_upper_tail(t, m90 * m, phi) / 5; end loop;
  full_ := public.fpl_nb_upper_tail(t, m90 * 90, phi);
  eb := coalesce(p_off_before_60, 0) + coalesce(p_off_60_84, 0) + coalesce(p_full, 0);
  if eb <= 0 then
    return coalesce(p_start, 0) * full_ + coalesce(p_sub, 0) * sub;
  end if;
  return coalesce(p_start, 0) * (coalesce(p_off_before_60, 0) * early + coalesce(p_off_60_84, 0) * mid + coalesce(p_full, 0) * full_) / eb
       + coalesce(p_sub, 0) * sub;
end $function$
;

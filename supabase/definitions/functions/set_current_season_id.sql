-- Live definition exported from the database (function set_current_season_id()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.set_current_season_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_season bigint;
begin
  if new.season_id is not null then
    return new;
  end if;
  -- Seasons run August to May, so the season a date belongs to is the
  -- one whose August start it falls after. Derived rather than
  -- hardcoded, so this keeps working at the 2027/28 rollover instead of
  -- silently stamping next season's data as 2026/27.
  select s.season_id into v_season
  from public.seasons s
  where current_date >= make_date(s.start_year, 8, 1)
    and current_date <  make_date(s.end_year, 8, 1)
  limit 1;

  new.season_id := v_season;
  return new;
end;
$function$
;

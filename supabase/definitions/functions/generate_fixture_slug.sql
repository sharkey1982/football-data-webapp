-- Live definition exported from the database (function generate_fixture_slug()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.generate_fixture_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_home_slug text;
  v_away_slug text;
begin
  if new.slug is not null then
    return new;
  end if;
  select slug into v_home_slug from public.teams where team_id = new.home_team_id;
  select slug into v_away_slug from public.teams where team_id = new.away_team_id;
  if v_home_slug is null or v_away_slug is null then
    raise exception 'Cannot generate fixture slug: missing team slug for home_team_id=% or away_team_id=%', new.home_team_id, new.away_team_id;
  end if;
  new.slug := v_home_slug || '-v-' || v_away_slug || '-' || new.kickoff_date::text;
  return new;
end;
$function$
;

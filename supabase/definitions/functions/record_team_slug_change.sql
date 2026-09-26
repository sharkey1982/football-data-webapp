-- Live definition exported from the database (function record_team_slug_change()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.record_team_slug_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.slug is distinct from new.slug then
    insert into public.team_slug_history (team_id, old_slug) values (old.team_id, old.slug);
  end if;
  return new;
end;
$function$
;

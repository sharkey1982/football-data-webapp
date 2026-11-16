-- Live definition exported from the database (function meta_flow_stamp_review()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.meta_flow_stamp_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if (new.purpose is distinct from old.purpose
      or new.refresh_note is distinct from old.refresh_note
      or new.status is distinct from old.status)
     and new.purpose_reviewed_at is not distinct from old.purpose_reviewed_at then
    new.purpose_reviewed_at := now();
  end if;
  return new;
end $function$
;

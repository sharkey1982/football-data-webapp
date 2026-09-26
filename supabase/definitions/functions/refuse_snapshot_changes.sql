-- Live definition exported from the database (function refuse_snapshot_changes()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refuse_snapshot_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  raise exception 'Projection snapshots are append-only: % refused on %', tg_op, tg_table_name;
end;
$function$
;

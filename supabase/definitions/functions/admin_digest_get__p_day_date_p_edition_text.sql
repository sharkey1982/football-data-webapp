-- Live definition exported from the database (function admin_digest_get(p_day date, p_edition text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.admin_digest_get(p_day date DEFAULT NULL::date, p_edition text DEFAULT 'evening'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_edition not in ('evening', 'morning') then raise exception 'unknown edition %', p_edition; end if;
  return private.admin_digest_for_day(coalesce(p_day, (now() at time zone 'Europe/London')::date), p_edition)
    || jsonb_build_object('sends', coalesce((
         select jsonb_agg(to_jsonb(s) order by s.queued_at desc)
           from (select * from private.admin_digest_sends order by queued_at desc limit 10) s), '[]'::jsonb));
end;
$function$
;

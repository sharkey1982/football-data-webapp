-- Live definition exported from the database (function check_credentials()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.check_credentials()
 RETURNS TABLE(check_name text, status text, found bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select 'credential_expiry_' || lower(c.credential),
         case when c.expires_on is null then 'warning'
              when c.expires_on < current_date then 'failed'
              when c.expires_on <= current_date + 7 then 'warning'
              else 'ok' end,
         coalesce((c.expires_on - current_date)::bigint, -1),
         case when c.expires_on is null
              then format('%s (%s, used by %s): expiry date unknown; record it in public.credential_expiries', c.credential, c.location, c.used_by)
              else format('Days until %s (%s, used by %s) expires on %s; warns 7 days ahead', c.credential, c.location, c.used_by, c.expires_on) end
    from public.credential_expiries c
  union all
  select 'x_connection',
         case when x.status is distinct from 'connected' or x.last_error is not null then 'warning' else 'ok' end,
         case when x.status is distinct from 'connected' or x.last_error is not null then 1 else 0 end,
         format('X account %s: status %s%s', coalesce('@' || x.x_username, '(none)'), coalesce(x.status, 'missing'),
                coalesce('; last error: ' || left(x.last_error, 200), ''))
    from (select 1) one
    left join lateral (select * from public.social_x_connection order by updated_at desc nulls last limit 1) x on true
$function$
;

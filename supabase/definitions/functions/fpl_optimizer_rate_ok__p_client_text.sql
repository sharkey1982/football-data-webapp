-- Live definition exported from the database (function fpl_optimizer_rate_ok(p_client text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_optimizer_rate_ok(p_client text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_client text := left(coalesce(nullif(p_client, ''), 'unknown'), 100);
begin
  delete from private.fpl_optimizer_calls where called_at < now() - interval '10 minutes';
  if (select count(*) from private.fpl_optimizer_calls where called_at > now() - interval '1 minute') >= 30
     or (select count(*) from private.fpl_optimizer_calls where client = v_client and called_at > now() - interval '1 minute') >= 4 then
    return false;
  end if;
  insert into private.fpl_optimizer_calls (client) values (v_client);
  return true;
end;
$function$
;

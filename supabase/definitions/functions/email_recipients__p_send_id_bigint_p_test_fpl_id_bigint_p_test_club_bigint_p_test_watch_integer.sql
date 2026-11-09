-- Live definition exported from the database (function email_recipients(p_send_id bigint, p_test_fpl_id bigint, p_test_club bigint, p_test_watch integer[])).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_recipients(p_send_id bigint, p_test_fpl_id bigint DEFAULT NULL::bigint, p_test_club bigint DEFAULT NULL::bigint, p_test_watch integer[] DEFAULT '{}'::integer[])
 RETURNS TABLE(subscriber_id bigint, email text, football boolean, token text, fpl_id bigint, club_id bigint, watchlist integer[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare v_kind text := (select kind from private.email_sends where send_id = p_send_id);
begin
  if v_kind is null then raise exception 'unknown send %', p_send_id; end if;
  if v_kind = 'test' then
    return query select null::bigint, private.email_admin_address(), true, null::text, p_test_fpl_id, p_test_club, p_test_watch
                  where private.email_admin_address() is not null;
  else
    return query
      select s.subscriber_id, s.email, 'football_market' = any (s.topics), private.email_new_token(s.subscriber_id, 'manage', null),
             s.fpl_entry_id, s.club_team_id, s.watchlist
        from private.email_subscribers s where s.status = 'confirmed' order by s.confirmed_at, s.subscriber_id;
  end if;
end;
$function$
;

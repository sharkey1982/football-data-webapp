-- Live definition exported from the database (function email_confirm(p_token text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_confirm(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id bigint := private.email_token_owner(p_token, array['confirm']); s private.email_subscribers;
begin
  if v_id is null then return jsonb_build_object('state', 'invalid'); end if;
  select * into s from private.email_subscribers where subscriber_id = v_id for update;
  if s.status = 'unsubscribed' then return jsonb_build_object('state', 'invalid'); end if;
  if s.status = 'confirmed' then
    return jsonb_build_object('state', 'already', 'football', 'football_market' = any (s.topics),
                              'manage', private.email_new_token(v_id, 'manage', null));
  end if;
  update private.email_subscribers set status = 'confirmed', confirmed_at = now(), updated_at = now() where subscriber_id = v_id;
  return jsonb_build_object('state', 'confirmed', 'football', 'football_market' = any (s.topics),
                            'manage', private.email_new_token(v_id, 'manage', null));
end;
$function$
;

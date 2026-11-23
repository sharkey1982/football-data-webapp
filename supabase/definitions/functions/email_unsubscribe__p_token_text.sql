-- Live definition exported from the database (function email_unsubscribe(p_token text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_unsubscribe(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id bigint := private.email_token_owner(p_token, array['manage', 'confirm']); s private.email_subscribers;
begin
  if v_id is null then return jsonb_build_object('state', 'invalid'); end if;
  select * into s from private.email_subscribers where subscriber_id = v_id for update;
  if s.status = 'unsubscribed' then return jsonb_build_object('state', 'already'); end if;
  update private.email_subscribers set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now() where subscriber_id = v_id;
  delete from private.email_tokens where subscriber_id = v_id and purpose = 'confirm';
  return jsonb_build_object('state', 'unsubscribed');
end;
$function$
;

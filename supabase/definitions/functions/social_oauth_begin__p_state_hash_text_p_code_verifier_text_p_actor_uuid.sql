-- Live definition exported from the database (function social_oauth_begin(p_state_hash text, p_code_verifier text, p_actor uuid)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_oauth_begin(p_state_hash text, p_code_verifier text, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  delete from private.social_oauth_states where expires_at < now();
  insert into private.social_oauth_states (state_hash, code_verifier, created_by) values (p_state_hash, p_code_verifier, p_actor);
  perform private.social_audit('x_connect_started', null, p_actor, '{}');
end;
$function$
;

-- Live definition exported from the database (function social_hold(p_candidate_id bigint, p_hold boolean)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_hold(p_candidate_id bigint, p_hold boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.social_post_candidates set held = p_hold,
         hold_until = case when not p_hold and hold_until < now() then now() else hold_until end, updated_at = now()
   where candidate_id = p_candidate_id and publication_status in ('unpublished', 'failed');
  if not found then raise exception 'candidate % cannot be held (already posted?)', p_candidate_id; end if;
  perform private.social_audit(case when p_hold then 'hold' else 'release' end, p_candidate_id, auth.uid(), '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$function$
;

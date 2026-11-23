-- Live definition exported from the database (function social_resolve_needs_check(p_candidate_id bigint, p_x_post_id text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_resolve_needs_check(p_candidate_id bigint, p_x_post_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_x_post_id is not null and p_x_post_id !~ '^[0-9]{5,25}$' then raise exception 'not an X post id'; end if;
  update public.social_post_candidates
     set publication_status = case when p_x_post_id is null then 'failed' else 'published' end,
         x_post_id = p_x_post_id, published_at = case when p_x_post_id is null then null else now() end, updated_at = now()
   where candidate_id = p_candidate_id and publication_status = 'needs_check';
  if not found then raise exception 'candidate % is not waiting for a check', p_candidate_id; end if;
  perform private.social_audit('resolve_needs_check', p_candidate_id, auth.uid(), jsonb_build_object('x_post_id', p_x_post_id));
  return jsonb_build_object('ok', true);
end;
$function$
;

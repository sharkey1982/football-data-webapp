-- Live definition exported from the database (function ai_lab_enqueue_batch(p_name text, p_model text, p_prompt_id text, p_question_ids text[])).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_lab_enqueue_batch(p_name text, p_model text, p_prompt_id text, p_question_ids text[])
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare b bigint;
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role' or session_user = 'postgres') then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if coalesce(array_length(p_question_ids, 1), 0) = 0 then raise exception 'no questions'; end if;
  insert into public.ai_batches (name, provider, model, prompt_id, toolset_version, question_ids, created_by)
  values (p_name, 'anthropic', p_model, p_prompt_id, 'ai_tools_v2', p_question_ids, auth.uid())
  returning batch_id into b;
  insert into public.ai_batch_items (batch_id, question_id)
  select b, q from unnest(p_question_ids) q
  on conflict do nothing;
  return b;
end $function$
;

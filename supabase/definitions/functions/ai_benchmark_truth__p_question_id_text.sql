-- Live definition exported from the database (function ai_benchmark_truth(p_question_id text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_benchmark_truth(p_question_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  q   text;
  out jsonb;
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role' or session_user = 'postgres') then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select ground_truth_sql into q from public.ai_benchmark_questions where question_id = p_question_id;
  if q is null then
    return null;
  end if;
  set local transaction_read_only = on;
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', q) into out;
  return out;
end $function$
;

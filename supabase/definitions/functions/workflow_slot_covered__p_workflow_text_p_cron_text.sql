-- Live definition exported from the database (function workflow_slot_covered(p_workflow text, p_cron text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.workflow_slot_covered(p_workflow text, p_cron text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
      from private.workflow_dispatches d
      join private.workflow_dispatch_slots s on s.slot_key = d.slot_key
     where s.workflow = p_workflow
       and p_cron = any (s.github_crons)
       and d.outcome = 'ok'
       and d.due_at > now() - interval '23 hours'
       and d.due_at <= now())
$function$
;

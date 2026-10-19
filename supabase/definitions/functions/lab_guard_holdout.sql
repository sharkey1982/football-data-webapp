-- Live definition exported from the database (function lab_guard_holdout()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.lab_guard_holdout()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rule text;
  v_opened timestamptz;
begin
  if tg_op <> 'INSERT' then
    raise exception 'lab_scorings is append-only: % refused', tg_op;
  end if;
  if new.split = 'holdout' then
    select decision_rule, holdout_opened_at into v_rule, v_opened from public.lab_experiments where experiment_id = new.experiment_id;
    if v_rule is null or length(trim(v_rule)) = 0 then
      raise exception 'Experiment % has no registered decision rule: holdout refused', new.experiment_id;
    end if;
    if v_opened is not null and v_opened < now() - interval '1 hour' then
      raise exception 'Holdout for % was opened at %; it can only be scored once', new.experiment_id, v_opened;
    end if;
    update public.lab_experiments
      set holdout_opened_at = coalesce(holdout_opened_at, now()), status = 'holdout_opened'
      where experiment_id = new.experiment_id;
  end if;
  return new;
end;
$function$
;

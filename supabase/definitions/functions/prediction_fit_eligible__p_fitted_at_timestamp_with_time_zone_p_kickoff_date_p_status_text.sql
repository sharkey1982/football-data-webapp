-- Live definition exported from the database (function prediction_fit_eligible(p_fitted_at timestamp with time zone, p_kickoff date, p_status text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.prediction_fit_eligible(p_fitted_at timestamp with time zone, p_kickoff date, p_status text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select p_fitted_at::date < case when p_status = 'postponed' then greatest(p_kickoff, current_date) else p_kickoff end
$function$
;

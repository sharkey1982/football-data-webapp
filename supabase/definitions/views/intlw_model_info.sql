-- Live definition exported from the database (view intlw_model_info).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intlw_model_info with (security_invoker=true) as
 SELECT model,
    params,
    fitted_through,
    updated_at
   FROM intlw.model_info;

-- Live definition exported from the database (view intl_model_info).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intl_model_info with (security_invoker=true) as
 SELECT model,
    params,
    fitted_through,
    updated_at
   FROM intl.model_info;

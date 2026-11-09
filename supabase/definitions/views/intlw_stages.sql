-- Live definition exported from the database (view intlw_stages).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intlw_stages with (security_invoker=true) as
 SELECT stage_key,
    edition_key,
    code,
    name,
    type,
    stage_order
   FROM intlw.stages;

-- Live definition exported from the database (view tennis_events).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.tennis_events with (security_invoker=true) as
 SELECT event_id,
    tour,
    slug,
    name,
    city,
    country,
    level,
    level_rank,
    surface,
    first_year,
    last_year,
    editions
   FROM tennis.events e;

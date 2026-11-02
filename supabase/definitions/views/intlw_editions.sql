-- Live definition exported from the database (view intlw_editions).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intlw_editions with (security_invoker=true) as
 SELECT e.edition_key,
    e.competition,
    c.slug AS competition_slug,
    e.label,
    e.season_start,
    e.teams,
    e.matches,
    e.hosts,
    e.first_match,
    e.last_match,
    e.stage_source
   FROM (intlw.editions e
     JOIN intlw.competitions c ON ((c.name = e.competition)));

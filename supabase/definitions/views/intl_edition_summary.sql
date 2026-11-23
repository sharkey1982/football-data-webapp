-- Live definition exported from the database (view intl_edition_summary).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intl_edition_summary with (security_invoker=true) as
 SELECT s.edition_key,
    s.competition,
    c.slug AS competition_slug,
    s.label,
    s.season_start,
    s.teams,
    s.matches,
    s.goals,
    s.hosts,
    s.winner,
    w.slug AS winner_slug,
    s.runner_up,
    r.slug AS runner_up_slug,
    s.final_key,
    s.first_match,
    s.last_match
   FROM (((intl.edition_summary s
     JOIN intl.competitions c ON ((c.name = s.competition)))
     LEFT JOIN intl.teams w ON ((w.team = s.winner)))
     LEFT JOIN intl.teams r ON ((r.team = s.runner_up)));

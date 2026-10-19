-- Live definition exported from the database (view tennis_editions).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.tennis_editions with (security_invoker=true) as
 SELECT d.tournament_id,
    d.year,
    d.event_id,
    ev.slug AS event_slug,
    d.tour,
    d.name,
    d.location,
    ev.city,
    ev.country,
    d.start_date,
    d.end_date,
    d.level,
    d.level_rank,
    d.surface,
    d.matches,
    w.name AS winner,
    w.slug AS winner_slug,
    r.name AS runner_up,
    r.slug AS runner_up_slug,
    d.final_key
   FROM (((tennis.editions d
     JOIN tennis.events ev USING (event_id))
     LEFT JOIN tennis.players w ON ((w.player_id = d.winner_id)))
     LEFT JOIN tennis.players r ON ((r.player_id = d.runner_up_id)));

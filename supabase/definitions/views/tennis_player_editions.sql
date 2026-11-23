-- Live definition exported from the database (view tennis_player_editions).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.tennis_player_editions with (security_invoker=true) as
 SELECT pe.player_id,
    p.tour,
    p.slug,
    pe.tournament_id,
    pe.year,
    pe.event_id,
    ev.slug AS event_slug,
    d.name,
    d.level,
    d.level_rank,
    d.surface,
    d.start_date,
    pe.won,
    pe.lost,
    pe.last_round,
    pe.last_round_order,
    pe.champion
   FROM (((tennis.player_editions pe
     JOIN tennis.players p USING (player_id))
     JOIN tennis.editions d ON (((d.tournament_id = pe.tournament_id) AND (d.year = pe.year))))
     JOIN tennis.events ev ON ((ev.event_id = pe.event_id)));

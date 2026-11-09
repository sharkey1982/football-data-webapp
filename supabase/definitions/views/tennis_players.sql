-- Live definition exported from the database (view tennis_players).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.tennis_players with (security_invoker=true) as
 SELECT p.player_id,
    p.tour,
    p.name,
    p.slug,
    t.matches,
    t.wins,
    t.first_match,
    t.last_match,
    t.won,
    t.lost,
    t.titles,
    t.finals,
    t.first_year,
    t.last_year,
    t.recent_matches,
    pp.country,
    pp.full_name,
    pp.birth_date,
    pp.hand,
    pp.wikidata_qid,
    t.best_rank,
    t.best_rank_date,
    r.latest_rank,
    r.last_match AS latest_rank_date
   FROM (((tennis.players p
     JOIN tennis.player_totals t USING (player_id))
     LEFT JOIN tennis.player_people pp USING (player_id))
     LEFT JOIN tennis.player_ratings r ON (((r.player_id = p.player_id) AND (r.surface = 'All'::text))));

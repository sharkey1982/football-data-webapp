-- Live definition exported from the database (view tennis_matches).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.tennis_matches with (security_invoker=true) as
 SELECT m.source_key,
    m.tour,
    m.year,
    m.match_date,
    t.tournament_id,
    t.name AS tournament,
    t.slug AS tournament_slug,
    m.location,
    m.series,
    m.court,
    m.surface,
    m.round,
    m.best_of,
    m.winner_id,
    w.name AS winner,
    w.slug AS winner_slug,
    m.loser_id,
    l.name AS loser,
    l.slug AS loser_slug,
    m.w_rank,
    m.l_rank,
    m.w_pts,
    m.l_pts,
    m.w_games,
    m.l_games,
    m.w_sets,
    m.l_sets,
    m.status,
    m.ps_w,
    m.ps_l,
    m.avg_w,
    m.avg_l,
    m.max_w,
    m.max_l,
    m.b365_w,
    m.b365_l,
    m.bfe_w,
    m.bfe_l,
    tennis.level_of(m.tour, m.series, t.name) AS level,
    tennis.level_rank(tennis.level_of(m.tour, m.series, t.name)) AS level_rank,
    tennis.round_order(m.round) AS round_order,
    tennis.result_of(m.status, m.w_games) AS result,
    (tennis.result_of(m.status, m.w_games) = ANY (ARRAY['Completed'::text, 'Retired'::text, 'Awarded'::text, 'Disqualified'::text])) AS played,
        CASE
            WHEN (m.surface = 'Greenset'::text) THEN 'Hard'::text
            ELSE m.surface
        END AS surface_group
   FROM (((tennis.matches m
     JOIN tennis.tournaments t ON ((t.tournament_id = m.tournament_id)))
     JOIN tennis.players w ON ((w.player_id = m.winner_id)))
     JOIN tennis.players l ON ((l.player_id = m.loser_id)));

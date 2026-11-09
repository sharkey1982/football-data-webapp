-- Live definition exported from the database (view fpl_player_penalties).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_player_penalties with (security_invoker=true) as
 WITH fpl AS (
         SELECT g.fpl_player_id,
            sum(g.goals_scored) AS goals,
            sum(g.penalties_missed) AS pen_missed,
            sum(g.expected_goals) AS xg,
            sum(g.minutes) AS minutes
           FROM fpl_player_gameweeks g
          WHERE (g.season_id = 13)
          GROUP BY g.fpl_player_id
        ), esp AS (
         SELECT g.fpl_player_id,
            count(*) FILTER (WHERE (g.penalty AND g.scoring AND (NOT g.own_goal))) AS pen_goals
           FROM (espn_pl_goals g
             JOIN espn_pl_matches m ON ((m.espn_event_id = g.espn_event_id)))
          WHERE ((m.match_date >= '2026-08-01'::date) AND (g.fpl_player_id IS NOT NULL))
          GROUP BY g.fpl_player_id
        )
 SELECT p.fpl_player_id,
    p.web_name,
    p.canonical_team_id AS team_id,
    fpl.minutes,
    fpl.goals,
    COALESCE(esp.pen_goals, (0)::bigint) AS pen_goals,
    COALESCE(fpl.pen_missed, (0)::bigint) AS pen_missed,
    (COALESCE(esp.pen_goals, (0)::bigint) + COALESCE(fpl.pen_missed, (0)::bigint)) AS pens_taken,
    (fpl.goals - COALESCE(esp.pen_goals, (0)::bigint)) AS np_goals,
    round(fpl.xg, 2) AS xg,
    round(GREATEST((fpl.xg - (0.79 * ((COALESCE(esp.pen_goals, (0)::bigint) + COALESCE(fpl.pen_missed, (0)::bigint)))::numeric)), (0)::numeric), 2) AS npxg,
    (NULLIF((p.source_payload ->> 'penalties_order'::text), ''::text))::integer AS fpl_penalty_order
   FROM ((fpl_players p
     JOIN fpl ON ((fpl.fpl_player_id = p.fpl_player_id)))
     LEFT JOIN esp ON ((esp.fpl_player_id = p.fpl_player_id)))
  WHERE (p.season_id = 13);

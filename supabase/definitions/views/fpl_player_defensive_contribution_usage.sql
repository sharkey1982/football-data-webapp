-- Live definition exported from the database (view fpl_player_defensive_contribution_usage).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_player_defensive_contribution_usage with (security_invoker=true) as
 SELECT p.season_id,
    p.fpl_player_id,
    p.element_type,
    count(g.fpl_fixture_id) FILTER (WHERE (g.minutes > 0)) AS appearances,
    sum(g.minutes) AS minutes,
    sum(COALESCE((((g.source_payload -> 'stats'::text) ->> 'clearances_blocks_interceptions'::text))::numeric, (0)::numeric)) AS cbi,
    sum(COALESCE((((g.source_payload -> 'stats'::text) ->> 'recoveries'::text))::numeric, (0)::numeric)) AS recoveries,
    sum(COALESCE((((g.source_payload -> 'stats'::text) ->> 'tackles'::text))::numeric, (0)::numeric)) AS tackles
   FROM (fpl_players p
     LEFT JOIN fpl_player_gameweeks g ON (((g.fpl_player_id = p.fpl_player_id) AND (g.season_id = p.season_id))))
  GROUP BY p.season_id, p.fpl_player_id, p.element_type;

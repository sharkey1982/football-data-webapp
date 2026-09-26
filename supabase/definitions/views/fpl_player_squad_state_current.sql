-- Live definition exported from the database (view fpl_player_squad_state_current).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_player_squad_state_current with (security_invoker=true) as
 SELECT DISTINCT ON (season_id, fpl_player_id) season_id,
    fpl_player_id,
    team_id,
    state,
    availability_probability,
    start_probability_override,
    effective_from,
    effective_to,
    source_name,
    source_reference,
    evidence,
    updated_at
   FROM fpl_player_squad_state
  WHERE ((effective_from <= now()) AND ((effective_to IS NULL) OR (effective_to > now())))
  ORDER BY season_id, fpl_player_id, (source_name = 'manual_tactical_override'::text) DESC, effective_from DESC;

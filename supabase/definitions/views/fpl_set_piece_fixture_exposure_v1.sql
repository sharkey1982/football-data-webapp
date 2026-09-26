-- Live definition exported from the database (view fpl_set_piece_fixture_exposure_v1).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_set_piece_fixture_exposure_v1 with (security_invoker=true) as
 SELECT r.fixture_id,
    r.team_id,
    r.fpl_player_id,
    h.set_piece_type,
    h.rank,
    r.expected_minutes,
    r.prob_starting_xi
   FROM (fixture_player_expected_minutes_resolved_v3 r
     JOIN set_piece_hierarchies h ON (((h.team_id = r.team_id) AND (h.source_player_id = (r.fpl_player_id)::text) AND (h.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)))));

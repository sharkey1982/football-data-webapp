-- Live definition exported from the database (view fpl_review_projections_v6).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_review_projections_v6 with (security_invoker=true) as
 WITH snap AS (
         SELECT DISTINCT ON (s.season_id, s.fpl_event_id, s.fixture_id, s.fpl_player_id) s.season_id,
            s.fpl_event_id,
            s.fixture_id,
            s.fpl_player_id,
            s.start_probability,
            s.expected_minutes,
            s.expected_fpl_points,
            s.projection_generated_at AS generated_at,
            s.snapshot_kind AS source
           FROM fpl_projection_snapshots s
          WHERE ((s.model_version = 'leaguewide_v6'::text) AND (s.snapshot_kind = ANY (ARRAY['pre_deadline'::text, 'late'::text])))
          ORDER BY s.season_id, s.fpl_event_id, s.fixture_id, s.fpl_player_id, (s.snapshot_kind = 'pre_deadline'::text) DESC, s.snapshot_row_id DESC
        ), snap_events AS (
         SELECT DISTINCT snap.season_id,
            snap.fpl_event_id
           FROM snap
        )
 SELECT snap.season_id,
    snap.fpl_event_id,
    snap.fixture_id,
    snap.fpl_player_id,
    snap.start_probability,
    snap.expected_minutes,
    snap.expected_fpl_points,
    snap.generated_at,
    snap.source
   FROM snap
UNION ALL
 SELECT p.season_id,
    ff.fpl_event_id,
    p.fixture_id,
    p.fpl_player_id,
    p.start_probability,
    p.expected_minutes,
    p.expected_fpl_points,
    p.generated_at,
    'live'::text AS source
   FROM (fpl_player_projections p
     JOIN fpl_fixtures ff ON (((ff.canonical_fixture_id = p.fixture_id) AND (ff.season_id = p.season_id))))
  WHERE ((p.model_version = 'leaguewide_v6'::text) AND (COALESCE(p.scenario_key, 'baseline'::text) = 'baseline'::text) AND (NOT (EXISTS ( SELECT 1
           FROM snap_events e
          WHERE ((e.season_id = p.season_id) AND (e.fpl_event_id = ff.fpl_event_id))))));

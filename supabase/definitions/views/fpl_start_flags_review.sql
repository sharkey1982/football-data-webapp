-- Live definition exported from the database (view fpl_start_flags_review).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_start_flags_review with (security_invoker=true) as
 SELECT f.fixture_id,
    fx.kickoff_date,
    fx.matchweek,
    f.team_id,
    ft.name AS team,
    f.fpl_player_id,
    p.web_name,
    f.raw_probability,
    f.probability,
    f.capped,
    f.starts_last,
    f.avail_last,
    f.depth_rank,
    f.tactical_role,
    f.role_source,
    f.refreshed_at
   FROM (((fpl_start_flags f
     JOIN fixtures fx ON ((fx.fixture_id = f.fixture_id)))
     JOIN fpl_players p ON (((p.season_id = fpl_current_season_id()) AND (p.fpl_player_id = f.fpl_player_id))))
     LEFT JOIN fpl_teams ft ON (((ft.season_id = fpl_current_season_id()) AND (ft.canonical_team_id = f.team_id))))
  WHERE (fx.kickoff_date >= ((now() AT TIME ZONE 'Europe/London'::text))::date);

-- Live definition exported from the database (view fixture_player_expected_minutes_fallback).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fixture_player_expected_minutes_fallback with (security_invoker=true) as
 WITH base AS (
         SELECT f.fixture_id,
            fp.canonical_team_id AS team_id,
            fp.fpl_player_id,
            fp.web_name,
            fp.element_type,
            fp.status,
            ((COALESCE(fp.chance_of_playing_next_round, fp.chance_of_playing_this_round,
                CASE
                    WHEN (fp.status = ANY (ARRAY['i'::text, 'u'::text, 's'::text])) THEN 0
                    ELSE 100
                END))::numeric / (100)::numeric) AS availability,
            COALESCE(u.appearances, (0)::bigint) AS apps,
            COALESCE(u.likely_starts, (0)::bigint) AS starts,
            COALESCE(u.sub_appearances, (0)::bigint) AS subs,
            COALESCE(u.avg_sub_minutes, (20)::numeric) AS avg_sub_minutes,
            COALESCE(h.squad_status, 'unknown'::text) AS squad_status,
            pt.tactical_role
           FROM (((((fixtures f
             JOIN leagues l ON ((l.league_id = f.league_id)))
             JOIN fpl_players fp ON (((fp.season_id = f.season_id) AND ((fp.canonical_team_id = f.home_team_id) OR (fp.canonical_team_id = f.away_team_id)))))
             LEFT JOIN fpl_player_substitution_usage u ON (((u.season_id = fp.season_id) AND (u.fpl_player_id = fp.fpl_player_id))))
             LEFT JOIN player_squad_hierarchy h ON (((h.season_id = fp.season_id) AND (h.fpl_player_id = fp.fpl_player_id))))
             LEFT JOIN player_tactical_profiles pt ON (((pt.season_id = fp.season_id) AND (pt.source_player_id = (fp.fpl_player_id)::text))))
          WHERE ((f.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (l.code = 'E0'::text))
        ), p AS (
         SELECT base.fixture_id,
            base.team_id,
            base.fpl_player_id,
            base.web_name,
            base.element_type,
            base.status,
            base.availability,
            base.apps,
            base.starts,
            base.subs,
            base.avg_sub_minutes,
            base.squad_status,
            base.tactical_role,
            LEAST(0.97, GREATEST((0)::numeric, (base.availability *
                CASE
                    WHEN (base.apps > 0) THEN (((base.starts)::numeric + 1.5) / ((base.apps)::numeric + 3.0))
                    ELSE
                    CASE base.squad_status
                        WHEN 'first_choice'::text THEN 0.72
                        WHEN 'rotation'::text THEN 0.38
                        WHEN 'backup'::text THEN 0.12
                        ELSE 0.18
                    END
                END))) AS start_prob
           FROM base
        ), r AS (
         SELECT p.fixture_id,
            p.team_id,
            p.fpl_player_id,
            p.web_name,
            p.element_type,
            p.status,
            p.availability,
            p.apps,
            p.starts,
            p.subs,
            p.avg_sub_minutes,
            p.squad_status,
            p.tactical_role,
            p.start_prob,
                CASE
                    WHEN (p.element_type = 1) THEN 90
                    WHEN (p.start_prob >= 0.7) THEN 78
                    WHEN (p.start_prob >= 0.4) THEN 72
                    ELSE 68
                END AS mins_start,
            LEAST(0.75, GREATEST((0)::numeric, ((p.availability * ((1)::numeric - p.start_prob)) *
                CASE p.squad_status
                    WHEN 'rotation'::text THEN 0.7
                    WHEN 'backup'::text THEN 0.5
                    WHEN 'first_choice'::text THEN 0.35
                    ELSE 0.3
                END))) AS sub_prob
           FROM p
        ), raw AS (
         SELECT r.fixture_id,
            r.team_id,
            r.fpl_player_id,
            r.web_name,
            r.element_type,
            r.status,
            r.availability,
            r.apps,
            r.starts,
            r.subs,
            r.avg_sub_minutes,
            r.squad_status,
            r.tactical_role,
            r.start_prob,
            r.mins_start,
            r.sub_prob,
            ((r.start_prob * (r.mins_start)::numeric) + (r.sub_prob * LEAST((40)::numeric, GREATEST((5)::numeric, r.avg_sub_minutes)))) AS raw_minutes
           FROM r
        ), sc AS (
         SELECT raw.fixture_id,
            raw.team_id,
            raw.fpl_player_id,
            raw.web_name,
            raw.element_type,
            raw.status,
            raw.availability,
            raw.apps,
            raw.starts,
            raw.subs,
            raw.avg_sub_minutes,
            raw.squad_status,
            raw.tactical_role,
            raw.start_prob,
            raw.mins_start,
            raw.sub_prob,
            raw.raw_minutes,
            ((990)::numeric / NULLIF(sum(raw.raw_minutes) OVER (PARTITION BY raw.fixture_id, raw.team_id), (0)::numeric)) AS scale
           FROM raw
        ), cap AS (
         SELECT sc.fixture_id,
            sc.team_id,
            sc.fpl_player_id,
            sc.web_name,
            sc.element_type,
            sc.status,
            sc.availability,
            sc.apps,
            sc.starts,
            sc.subs,
            sc.avg_sub_minutes,
            sc.squad_status,
            sc.tactical_role,
            sc.start_prob,
            sc.mins_start,
            sc.sub_prob,
            sc.raw_minutes,
            sc.scale,
            LEAST((90)::numeric, (sc.raw_minutes * sc.scale)) AS capped
           FROM sc
        ), fin AS (
         SELECT cap.fixture_id,
            cap.team_id,
            cap.fpl_player_id,
            cap.web_name,
            cap.element_type,
            cap.status,
            cap.availability,
            cap.apps,
            cap.starts,
            cap.subs,
            cap.avg_sub_minutes,
            cap.squad_status,
            cap.tactical_role,
            cap.start_prob,
            cap.mins_start,
            cap.sub_prob,
            cap.raw_minutes,
            cap.scale,
            cap.capped,
            LEAST((90)::numeric, (cap.capped + ((((990)::numeric - sum(cap.capped) OVER (PARTITION BY cap.fixture_id, cap.team_id)) * cap.capped) / NULLIF(sum(cap.capped) OVER (PARTITION BY cap.fixture_id, cap.team_id), (0)::numeric)))) AS expected_minutes
           FROM cap
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    web_name,
    element_type,
    tactical_role,
    start_prob AS prob_starting_xi,
    sub_prob AS prob_sub_appearance,
    availability,
    expected_minutes,
    'fallback_history_hierarchy'::text AS minutes_source
   FROM fin;

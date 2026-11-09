-- Live definition exported from the database (view fpl_fallback_start_probability_v6).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_fallback_start_probability_v6 with (security_invoker=true) as
 WITH base AS (
         SELECT f.fixture_id,
            fp.canonical_team_id AS team_id,
            fp.fpl_player_id,
            fp.element_type,
            COALESCE(u.appearances, (0)::bigint) AS apps,
            COALESCE(u.likely_starts, (0)::bigint) AS starts,
            COALESCE(u.sub_appearances, (0)::bigint) AS subs,
            COALESCE(av.availability, ((COALESCE(fp.chance_of_playing_next_round, fp.chance_of_playing_this_round,
                CASE
                    WHEN (fp.status = ANY (ARRAY['i'::text, 'u'::text, 's'::text])) THEN 0
                    ELSE 100
                END))::numeric / (100)::numeric)) AS availability,
            COALESCE(h.squad_status, 'unknown'::text) AS squad_status,
            COALESCE(sr.starts, 0) AS sr_starts,
            COALESCE(sr.available_matches, 0) AS sr_available,
            sr.prior_rate,
            fc.start_if_fit,
            ds.start_probability AS depth_start
           FROM ((((((((fixtures f
             JOIN leagues l ON ((l.league_id = f.league_id)))
             JOIN fpl_players fp ON (((fp.season_id = f.season_id) AND ((fp.canonical_team_id = f.home_team_id) OR (fp.canonical_team_id = f.away_team_id)))))
             LEFT JOIN fpl_player_substitution_usage u ON (((u.season_id = fp.season_id) AND (u.fpl_player_id = fp.fpl_player_id))))
             LEFT JOIN player_squad_hierarchy h ON (((h.season_id = fp.season_id) AND (h.fpl_player_id = fp.fpl_player_id))))
             LEFT JOIN fpl_fixture_availability_store av ON (((av.fixture_id = f.fixture_id) AND (av.fpl_player_id = fp.fpl_player_id))))
             LEFT JOIN fpl_player_start_record sr ON ((sr.fpl_player_id = fp.fpl_player_id)))
             LEFT JOIN fpl_depth_start_store ds ON (((ds.fixture_id = f.fixture_id) AND (ds.fpl_player_id = fp.fpl_player_id) AND (ds.team_id = fp.canonical_team_id))))
             LEFT JOIN LATERAL ( SELECT c.start_if_fit
                   FROM fpl_player_first_choice c
                  WHERE ((c.fpl_player_id = fp.fpl_player_id) AND (c.removed_at IS NULL) AND (f.kickoff_date >= c.effective_from) AND (f.kickoff_date <= COALESCE(c.effective_to, '9999-12-31'::date)))
                  ORDER BY c.set_at DESC
                 LIMIT 1) fc ON (true))
          WHERE ((f.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (l.code = 'E0'::text))
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    COALESCE(depth_start, LEAST(0.98, (availability *
        CASE
            WHEN (start_if_fit IS NOT NULL) THEN start_if_fit
            WHEN (element_type <> 1) THEN LEAST(0.97, (((sr_starts)::numeric + COALESCE(prior_rate, 0.20)) / ((sr_available)::numeric + 1.0)))
            WHEN ((apps >= 4) AND (starts = apps)) THEN 0.96
            WHEN ((apps = 3) AND (starts = 3)) THEN 0.94
            WHEN ((apps >= 3) AND (starts >= (apps - 1))) THEN 0.84
            WHEN (apps > 0) THEN GREATEST(0.05, LEAST(0.90, (((starts)::numeric + 0.5) / ((apps)::numeric + 1.0))))
            ELSE
            CASE squad_status
                WHEN 'first_choice'::text THEN 0.72
                WHEN 'rotation'::text THEN 0.38
                WHEN 'backup'::text THEN 0.12
                ELSE 0.18
            END
        END))) AS start_probability,
    availability,
    apps,
    starts,
    subs,
        CASE
            WHEN (depth_start IS NOT NULL) THEN
            CASE
                WHEN (depth_start >= 0.80) THEN 'depth_chart_firm'::text
                WHEN (depth_start >= 0.55) THEN 'depth_chart_likely'::text
                ELSE 'depth_chart_backup'::text
            END
            WHEN (start_if_fit IS NOT NULL) THEN 'nailed_history'::text
            WHEN ((element_type <> 1) AND (sr_available >= 3) AND (sr_starts >= sr_available)) THEN 'nailed_history'::text
            WHEN ((element_type <> 1) AND (sr_available >= 3) AND (sr_starts >= (sr_available - 1))) THEN 'strong_history'::text
            WHEN (element_type <> 1) THEN 'history_hierarchy'::text
            WHEN ((apps >= 3) AND (starts = apps)) THEN 'nailed_history'::text
            WHEN ((apps >= 3) AND (starts >= (apps - 1))) THEN 'strong_history'::text
            ELSE 'history_hierarchy'::text
        END AS probability_source
   FROM base;

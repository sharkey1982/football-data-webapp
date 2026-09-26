-- Live definition exported from the database (view tactical_formation_slot_priors).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.tactical_formation_slot_priors with (security_invoker=true) as
 SELECT a.tactical_source_id,
    s.source_name,
    s.source_season_label,
    s.competition_name,
    a.source_formation_code,
    m.canonical_formation,
    m.mapping_confidence,
    a.source_formation_slot,
    a.venue_scope,
    a.starts,
    a.minutes,
    a.goals,
    a.open_play_goals,
    a.assists,
    a.key_passes,
    a.shots,
    a.shots_on_target,
    a.big_chances,
    a.opp_box_touches,
    a.set_piece_assists,
        CASE
            WHEN (a.minutes > (0)::numeric) THEN (((90)::numeric * a.goals) / a.minutes)
            ELSE NULL::numeric
        END AS goals_per90,
        CASE
            WHEN (a.minutes > (0)::numeric) THEN (((90)::numeric * a.open_play_goals) / a.minutes)
            ELSE NULL::numeric
        END AS open_play_goals_per90,
        CASE
            WHEN (a.minutes > (0)::numeric) THEN (((90)::numeric * a.assists) / a.minutes)
            ELSE NULL::numeric
        END AS assists_per90,
        CASE
            WHEN (a.minutes > (0)::numeric) THEN (((90)::numeric * a.key_passes) / a.minutes)
            ELSE NULL::numeric
        END AS key_passes_per90,
        CASE
            WHEN (a.minutes > (0)::numeric) THEN (((90)::numeric * a.shots) / a.minutes)
            ELSE NULL::numeric
        END AS shots_per90,
        CASE
            WHEN (a.minutes > (0)::numeric) THEN (((90)::numeric * a.shots_on_target) / a.minutes)
            ELSE NULL::numeric
        END AS shots_on_target_per90,
        CASE
            WHEN (a.minutes > (0)::numeric) THEN (((90)::numeric * a.big_chances) / a.minutes)
            ELSE NULL::numeric
        END AS big_chances_per90,
        CASE
            WHEN (a.minutes > (0)::numeric) THEN (((90)::numeric * a.opp_box_touches) / a.minutes)
            ELSE NULL::numeric
        END AS opp_box_touches_per90,
        CASE
            WHEN (sum(a.goals) OVER (PARTITION BY a.tactical_source_id, a.source_formation_code, a.venue_scope) > (0)::numeric) THEN (a.goals / sum(a.goals) OVER (PARTITION BY a.tactical_source_id, a.source_formation_code, a.venue_scope))
            ELSE NULL::numeric
        END AS goal_share,
        CASE
            WHEN (sum(a.assists) OVER (PARTITION BY a.tactical_source_id, a.source_formation_code, a.venue_scope) > (0)::numeric) THEN (a.assists / sum(a.assists) OVER (PARTITION BY a.tactical_source_id, a.source_formation_code, a.venue_scope))
            ELSE NULL::numeric
        END AS assist_share,
        CASE
            WHEN (sum(a.open_play_goals) OVER (PARTITION BY a.tactical_source_id, a.source_formation_code, a.venue_scope) > (0)::numeric) THEN (a.open_play_goals / sum(a.open_play_goals) OVER (PARTITION BY a.tactical_source_id, a.source_formation_code, a.venue_scope))
            ELSE NULL::numeric
        END AS open_play_goal_share
   FROM ((tactical_formation_slot_aggregates a
     JOIN tactical_data_sources s USING (tactical_source_id))
     LEFT JOIN tactical_formation_mappings m USING (tactical_source_id, source_formation_code));

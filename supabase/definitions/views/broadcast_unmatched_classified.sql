-- Live definition exported from the database (view broadcast_unmatched_classified).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.broadcast_unmatched_classified as
 SELECT airtable_record_id,
    kickoff_date,
    competition_label,
    home_raw,
    away_raw,
    reason,
        CASE
            WHEN (((record -> 'fields'::text) = '{}'::jsonb) OR ((home_raw IS NULL) AND (away_raw IS NULL) AND (kickoff_date IS NULL))) THEN 'record_empty'::text
            WHEN ((reason ~~* '%competition not covered%'::text) OR (EXISTS ( SELECT 1
               FROM broadcast_competition_coverage c
              WHERE (c.label = u.competition_label)))) THEN 'competition_not_covered'::text
            WHEN ((reason ~~* '%competition not mapped%'::text) OR (reason ~~* '%competition not in database%'::text)) THEN 'competition_unmapped'::text
            WHEN (reason ~~* '%unknown team%'::text) THEN 'team_alias_missing'::text
            WHEN (reason ~~* '%ambiguous%'::text) THEN 'ambiguous'::text
            WHEN (reason ~~* '%no fixture%'::text) THEN 'no_fixture'::text
            ELSE 'other'::text
        END AS category,
    (kickoff_date < CURRENT_DATE) AS is_past,
    first_seen_at,
    last_seen_at
   FROM broadcast_sync_unmatched u
  WHERE (resolved_at IS NULL);

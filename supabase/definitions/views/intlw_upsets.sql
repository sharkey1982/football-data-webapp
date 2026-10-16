-- Live definition exported from the database (view intlw_upsets).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intlw_upsets with (security_invoker=true) as
 SELECT u.expectation,
    u.kind,
    m.match_key,
    m.match_date,
    m.home_team,
    m.home_slug,
    m.home_name,
    m.away_team,
    m.away_slug,
    m.away_name,
    m.home_score,
    m.away_score,
    m.home_score_90,
    m.away_score_90,
    m.went_extra_time,
    m.shootout_winner,
    m.competition,
    m.competition_slug,
    m.competition_kind,
    m.edition_key,
    m.stage_code,
    m.stage_name,
    m.stage_type,
    m.group_label,
    m.matchday,
    m.city,
    m.country,
    m.neutral,
    m.elo_home_pre,
    m.elo_away_pre,
    m.elo_change
   FROM (intlw.upsets u
     JOIN intlw_matches m ON ((m.match_key = u.match_key)));

-- Live definition exported from the database (view intl_matches).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intl_matches with (security_invoker=true) as
 SELECT m.match_key,
    m.match_date,
    m.home_team,
    ht.slug AS home_slug,
    intl.name_at(m.home_team, m.match_date) AS home_name,
    m.away_team,
    awt.slug AS away_slug,
    intl.name_at(m.away_team, m.match_date) AS away_name,
    m.home_score,
    m.away_score,
    m.home_score_90,
    m.away_score_90,
    m.went_extra_time,
    m.shootout_winner,
    m.competition,
    c.slug AS competition_slug,
    c.kind AS competition_kind,
    m.edition_key,
    m.stage_code,
    s.name AS stage_name,
    s.type AS stage_type,
    m.group_label,
    m.matchday,
    m.city,
    m.country,
    m.neutral,
    m.elo_home_pre,
    m.elo_away_pre,
    m.elo_change
   FROM ((((intl.matches m
     JOIN intl.teams ht ON ((ht.team = m.home_team)))
     JOIN intl.teams awt ON ((awt.team = m.away_team)))
     JOIN intl.competitions c ON ((c.name = m.competition)))
     LEFT JOIN intl.stages s ON (((s.edition_key = m.edition_key) AND (s.code = m.stage_code))));

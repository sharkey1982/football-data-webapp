-- Live definition exported from the database (view intlw_fixtures).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.intlw_fixtures with (security_invoker=true) as
 SELECT f.fixture_key,
    f.edition_key,
    f.kickoff_utc,
    f.home_team,
    ht.slug AS home_slug,
    f.away_team,
    awt.slug AS away_slug,
    f.group_label,
    f.round_number,
    f.venue,
    COALESCE(m.home_score, f.home_score) AS home_score,
    COALESCE(m.away_score, f.away_score) AS away_score,
    m.match_key,
    p.p_home,
    p.p_draw,
    p.p_away,
    p.xg_home,
    p.xg_away,
    p.scores
   FROM ((((intlw.fixtures f
     JOIN intlw.teams ht ON ((ht.team = f.home_team)))
     JOIN intlw.teams awt ON ((awt.team = f.away_team)))
     LEFT JOIN intlw.matches m ON (((m.home_team = f.home_team) AND (m.away_team = f.away_team) AND ((m.match_date >= (((f.kickoff_utc AT TIME ZONE 'Europe/London'::text))::date - 1)) AND (m.match_date <= (((f.kickoff_utc AT TIME ZONE 'Europe/London'::text))::date + 1))))))
     LEFT JOIN intlw.projections p ON ((p.fixture_key = f.fixture_key)));

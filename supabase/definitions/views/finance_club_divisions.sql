-- Live definition exported from the database (view finance_club_divisions).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.finance_club_divisions with (security_invoker=true) as
 WITH apps AS (
         SELECT f.team_id,
            f.league_id,
            count(*) AS fixtures
           FROM (( SELECT fixtures.league_id,
                    fixtures.season_id,
                    fixtures.home_team_id AS team_id
                   FROM fixtures
                UNION ALL
                 SELECT fixtures.league_id,
                    fixtures.season_id,
                    fixtures.away_team_id
                   FROM fixtures) f
             JOIN leagues l_1 ON ((l_1.league_id = f.league_id)))
          WHERE ((f.season_id = current_season_id()) AND (l_1.competition_type = 'league'::text) AND (l_1.scope = 'domestic'::text))
          GROUP BY f.team_id, f.league_id
        ), pick AS (
         SELECT DISTINCT ON (a.team_id) a.team_id,
            a.league_id
           FROM apps a
          WHERE (a.team_id IN ( SELECT finance_published_periods.team_id
                   FROM finance_published_periods))
          ORDER BY a.team_id, a.fixtures DESC, a.league_id
        )
 SELECT p.team_id,
    l.league_id,
    l.code AS league_code,
    l.name AS league_name,
    l.slug AS league_slug,
    c.name AS country,
        CASE
            WHEN (c.name = 'England'::text) THEN 0
            ELSE 1
        END AS country_order,
    COALESCE(l.tier,
        CASE l.code
            WHEN 'E0'::text THEN 1
            WHEN 'E1'::text THEN 2
            WHEN 'E2'::text THEN 3
            WHEN 'E3'::text THEN 4
            WHEN 'EC'::text THEN 5
            ELSE NULL::integer
        END, 9) AS division_order
   FROM ((pick p
     JOIN leagues l ON ((l.league_id = p.league_id)))
     LEFT JOIN countries c ON ((c.country_id = l.country_id)));

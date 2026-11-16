-- Live definition exported from the database (view finance_period_divisions).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.finance_period_divisions with (security_invoker=true) as
 WITH apps AS (
         SELECT m.team_id,
            m.season_id,
            m.league_id,
            count(*) AS matches
           FROM (( SELECT matches.league_id,
                    matches.season_id,
                    matches.home_team_id AS team_id
                   FROM matches
                UNION ALL
                 SELECT matches.league_id,
                    matches.season_id,
                    matches.away_team_id
                   FROM matches) m
             JOIN leagues l_1 ON ((l_1.league_id = m.league_id)))
          WHERE ((l_1.competition_type = 'league'::text) AND (l_1.scope = 'domestic'::text))
          GROUP BY m.team_id, m.season_id, m.league_id
        ), pick AS (
         SELECT DISTINCT ON (p.team_id, p.period_end) p.team_id,
            p.period_end,
            p.season_id,
            a.league_id
           FROM (finance_published_periods p
             JOIN apps a ON (((a.team_id = p.team_id) AND (a.season_id = p.season_id))))
          ORDER BY p.team_id, p.period_end, a.matches DESC, a.league_id
        )
 SELECT pk.team_id,
    pk.period_end,
    pk.season_id,
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
   FROM ((pick pk
     JOIN leagues l ON ((l.league_id = pk.league_id)))
     LEFT JOIN countries c ON ((c.country_id = l.country_id)));

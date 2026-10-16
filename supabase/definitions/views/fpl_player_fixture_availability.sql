-- Live definition exported from the database (view fpl_player_fixture_availability).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_player_fixture_availability with (security_invoker=true) as
 WITH season AS (
         SELECT fpl_current_season_id() AS season_id
        ), nxt AS (
         SELECT min(g.fpl_event_id) AS next_event,
            min(g.deadline_time) AS next_deadline
           FROM fpl_gameweeks g
          WHERE ((g.season_id = ( SELECT season.season_id
                   FROM season)) AND (g.deadline_time > now()))
        ), fx AS (
         SELECT f.fixture_id,
            f.kickoff_date,
            f.home_team_id,
            f.away_team_id,
            ff.fpl_event_id
           FROM ((fixtures f
             JOIN leagues l ON (((l.league_id = f.league_id) AND (l.code = 'E0'::text))))
             LEFT JOIN fpl_fixtures ff ON (((ff.canonical_fixture_id = f.fixture_id) AND (ff.season_id = f.season_id))))
          WHERE ((f.season_id = ( SELECT season.season_id
                   FROM season)) AND (f.status <> 'played'::text))
        ), pl AS (
         SELECT p.fpl_player_id,
            p.canonical_team_id AS team_id,
                CASE
                    WHEN (d.manual_status IS NOT NULL) THEN d.manual_status
                    WHEN ((d.manual_return_date > CURRENT_DATE) AND (COALESCE(p.status, 'a'::text) = 'a'::text)) THEN 'i'::text
                    ELSE COALESCE(p.status, 'a'::text)
                END AS status,
                CASE
                    WHEN (d.manual_status IS NOT NULL) THEN NULL::integer
                    ELSE p.chance_of_playing_next_round
                END AS chance_of_playing_next_round,
            p.news,
            m.m AS date_parts,
            COALESCE((p.news_added)::date, CURRENT_DATE) AS news_date,
            d.manual_return_date
           FROM ((fpl_players p
             LEFT JOIN team_player_tactical_defaults d ON (((d.fpl_player_id = p.fpl_player_id) AND (d.season_id = p.season_id) AND (d.team_id = p.canonical_team_id))))
             LEFT JOIN LATERAL regexp_match(p.news, '(?:back|until)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'::text, 'i'::text) m(m) ON (true))
          WHERE (p.season_id = ( SELECT season.season_id
                   FROM season))
        ), pl2 AS (
         SELECT pl.fpl_player_id,
            pl.team_id,
            pl.status,
            pl.chance_of_playing_next_round,
            pl.news,
                CASE
                    WHEN (pl.manual_return_date IS NOT NULL) THEN pl.manual_return_date
                    WHEN (pl.date_parts IS NULL) THEN NULL::date
                    WHEN (to_date(((((pl.date_parts[1] || ' '::text) || pl.date_parts[2]) || ' '::text) || (EXTRACT(year FROM pl.news_date))::text), 'DD Mon YYYY'::text) < (pl.news_date - 14)) THEN ((to_date(((((pl.date_parts[1] || ' '::text) || pl.date_parts[2]) || ' '::text) || (EXTRACT(year FROM pl.news_date))::text), 'DD Mon YYYY'::text) + '1 year'::interval))::date
                    ELSE to_date(((((pl.date_parts[1] || ' '::text) || pl.date_parts[2]) || ' '::text) || (EXTRACT(year FROM pl.news_date))::text), 'DD Mon YYYY'::text)
                END AS return_date
           FROM pl
        ), pf AS (
         SELECT fx.fixture_id,
            pl2.fpl_player_id,
            pl2.team_id,
            fx.kickoff_date,
            fx.fpl_event_id,
            GREATEST(0, COALESCE((fx.fpl_event_id - nxt.next_event), (floor((((fx.kickoff_date - (nxt.next_deadline)::date))::numeric / 7.0)))::integer, 0)) AS gameweeks_ahead,
            pl2.status,
            pl2.chance_of_playing_next_round,
            pl2.return_date,
                CASE
                    WHEN ((pl2.return_date IS NOT NULL) AND (fx.kickoff_date >= pl2.return_date)) THEN row_number() OVER (PARTITION BY pl2.fpl_player_id, (fx.kickoff_date >= pl2.return_date) ORDER BY fx.kickoff_date, fx.fixture_id)
                    ELSE NULL::bigint
                END AS match_back
           FROM ((pl2
             JOIN fx ON (((pl2.team_id = fx.home_team_id) OR (pl2.team_id = fx.away_team_id))))
             CROSS JOIN nxt)
        )
 SELECT pf.fixture_id,
    pf.fpl_player_id,
    pf.team_id,
    pf.kickoff_date,
    pf.fpl_event_id,
    pf.gameweeks_ahead,
    pf.status,
    pf.chance_of_playing_next_round,
    pf.return_date,
    round(r.availability, 4) AS availability,
    r.rule
   FROM (pf
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (pf.status = 'a'::text) THEN (1)::numeric
                    WHEN (pf.status = ANY (ARRAY['u'::text, 'n'::text])) THEN (0)::numeric
                    WHEN ((pf.status = 's'::text) AND (pf.return_date IS NOT NULL)) THEN
                    CASE
                        WHEN (pf.kickoff_date < pf.return_date) THEN (0)::numeric
                        ELSE (1)::numeric
                    END
                    WHEN (pf.status = 's'::text) THEN
                    CASE
                        WHEN (pf.gameweeks_ahead = 0) THEN (0)::numeric
                        ELSE (1)::numeric
                    END
                    WHEN ((pf.return_date > CURRENT_DATE) AND (pf.kickoff_date < pf.return_date)) THEN
                    CASE
                        WHEN ((pf.status = 'd'::text) AND (pf.gameweeks_ahead = 0)) THEN ((COALESCE(pf.chance_of_playing_next_round, 75))::numeric / 100.0)
                        ELSE (0)::numeric
                    END
                    WHEN (pf.return_date > CURRENT_DATE) THEN
                    CASE pf.match_back
                        WHEN 1 THEN 0.75
                        WHEN 2 THEN 0.90
                        ELSE (1)::numeric
                    END
                    WHEN ((pf.status = 'i'::text) AND (pf.return_date IS NOT NULL)) THEN
                    CASE pf.gameweeks_ahead
                        WHEN 0 THEN ((COALESCE(pf.chance_of_playing_next_round, 0))::numeric / 100.0)
                        WHEN 1 THEN 0.50
                        WHEN 2 THEN 0.75
                        WHEN 3 THEN 0.90
                        ELSE (1)::numeric
                    END
                    WHEN (pf.status = 'd'::text) THEN ((1)::numeric - (((1)::numeric - ((COALESCE(pf.chance_of_playing_next_round, 75))::numeric / 100.0)) * power(0.5, (pf.gameweeks_ahead)::numeric)))
                    WHEN (pf.status = 'i'::text) THEN
                    CASE
                        WHEN (pf.gameweeks_ahead <= 1) THEN (0)::numeric
                        ELSE LEAST(0.60, (0.15 * ((pf.gameweeks_ahead - 1))::numeric))
                    END
                    ELSE (1)::numeric
                END AS availability,
                CASE
                    WHEN (pf.status = 'a'::text) THEN 'available'::text
                    WHEN (pf.status = ANY (ARRAY['u'::text, 'n'::text])) THEN 'unavailable'::text
                    WHEN ((pf.status = 's'::text) AND (pf.return_date IS NOT NULL)) THEN 'suspended_until'::text
                    WHEN (pf.status = 's'::text) THEN 'suspended_next'::text
                    WHEN ((pf.return_date > CURRENT_DATE) AND (pf.kickoff_date < pf.return_date)) THEN 'before_return_date'::text
                    WHEN (pf.return_date > CURRENT_DATE) THEN 'returning'::text
                    WHEN ((pf.status = 'i'::text) AND (pf.return_date IS NOT NULL)) THEN 'return_date_passed'::text
                    WHEN (pf.status = 'd'::text) THEN 'doubt'::text
                    WHEN (pf.status = 'i'::text) THEN 'injured_no_date'::text
                    ELSE 'other'::text
                END AS rule) r);

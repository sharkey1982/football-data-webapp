-- FPL availability: round to 4 decimal places (5 Oct 2026). The doubt rule
-- (1 - (1 - chance) * 0.5^k) produced numerics with hundreds of digits, which
-- slowed the projection arithmetic and would be stored in every projection.

create or replace view public.fpl_player_fixture_availability with (security_invoker=true) as
 WITH season AS (
         SELECT fpl_current_season_id() AS season_id
        ), nxt AS (
         SELECT min(g.fpl_event_id) AS next_event,
            min(g.deadline_time) AS next_deadline
           FROM fpl_gameweeks g
          WHERE g.season_id = (SELECT season_id FROM season) AND g.deadline_time > now()
        ), fx AS (
         SELECT f.fixture_id,
            f.kickoff_date,
            f.home_team_id,
            f.away_team_id,
            ff.fpl_event_id
           FROM fixtures f
             JOIN leagues l ON l.league_id = f.league_id AND l.code = 'E0'::text
             LEFT JOIN fpl_fixtures ff ON ff.canonical_fixture_id = f.fixture_id AND ff.season_id = f.season_id
          WHERE f.season_id = (SELECT season_id FROM season) AND f.status <> 'played'::text
        ), pl AS (
         SELECT p.fpl_player_id,
            p.canonical_team_id AS team_id,
            COALESCE(p.status, 'a'::text) AS status,
            p.chance_of_playing_next_round,
            p.news,
            m.m AS date_parts,
            COALESCE(p.news_added::date, CURRENT_DATE) AS news_date
           FROM fpl_players p
             LEFT JOIN LATERAL regexp_match(p.news, '(?:back|until)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'::text, 'i'::text) m(m) ON true
          WHERE p.season_id = (SELECT season_id FROM season)
        ), pl2 AS (
         SELECT pl.fpl_player_id, pl.team_id, pl.status, pl.chance_of_playing_next_round, pl.news,
            CASE
                WHEN pl.date_parts IS NULL THEN NULL::date
                -- The news carries no year: take the year the news was posted, and the next
                -- one if that would put the date more than two weeks before the news itself.
                WHEN to_date(pl.date_parts[1] || ' ' || pl.date_parts[2] || ' ' || extract(year FROM pl.news_date)::text, 'DD Mon YYYY') < (pl.news_date - 14)
                  THEN (to_date(pl.date_parts[1] || ' ' || pl.date_parts[2] || ' ' || extract(year FROM pl.news_date)::text, 'DD Mon YYYY') + '1 year'::interval)::date
                ELSE to_date(pl.date_parts[1] || ' ' || pl.date_parts[2] || ' ' || extract(year FROM pl.news_date)::text, 'DD Mon YYYY')
            END AS return_date
           FROM pl
        ), pf AS (
         SELECT fx.fixture_id,
            pl2.fpl_player_id,
            pl2.team_id,
            fx.kickoff_date,
            fx.fpl_event_id,
            -- 0 = the next gameweek (the one FPL's "chance of playing next round" is about).
            GREATEST(0, COALESCE(fx.fpl_event_id - nxt.next_event, floor((fx.kickoff_date - nxt.next_deadline::date)::numeric / 7.0)::integer, 0)) AS gameweeks_ahead,
            pl2.status,
            pl2.chance_of_playing_next_round,
            pl2.return_date,
            -- Which match back this is: 1 = the first on or after the return date.
            CASE WHEN pl2.return_date IS NOT NULL AND fx.kickoff_date >= pl2.return_date
              THEN row_number() OVER (PARTITION BY pl2.fpl_player_id, (fx.kickoff_date >= pl2.return_date) ORDER BY fx.kickoff_date, fx.fixture_id)
            END AS match_back
           FROM pl2
             JOIN fx ON pl2.team_id = fx.home_team_id OR pl2.team_id = fx.away_team_id
             CROSS JOIN nxt
        )
 SELECT fixture_id,
    fpl_player_id,
    team_id,
    kickoff_date,
    fpl_event_id,
    gameweeks_ahead,
    status,
    chance_of_playing_next_round,
    return_date,
    round(r.availability, 4) AS availability,
    r.rule
   FROM pf
     CROSS JOIN LATERAL (
       SELECT CASE
            WHEN pf.status = 'a'::text THEN 1::numeric
            WHEN pf.status = ANY (ARRAY['u'::text, 'n'::text]) THEN 0::numeric
            WHEN pf.status = 's'::text AND pf.return_date IS NOT NULL THEN CASE WHEN pf.kickoff_date < pf.return_date THEN 0::numeric ELSE 1::numeric END
            WHEN pf.status = 's'::text THEN CASE WHEN pf.gameweeks_ahead = 0 THEN 0::numeric ELSE 1::numeric END
            -- Return date still ahead: out before it, then 75%, 90%, fit.
            WHEN pf.return_date > CURRENT_DATE AND pf.kickoff_date < pf.return_date THEN
              CASE WHEN pf.status = 'd'::text AND pf.gameweeks_ahead = 0 THEN COALESCE(pf.chance_of_playing_next_round, 75)::numeric / 100.0 ELSE 0::numeric END
            WHEN pf.return_date > CURRENT_DATE THEN
              CASE pf.match_back WHEN 1 THEN 0.75 WHEN 2 THEN 0.90 ELSE 1::numeric END
            -- Return date passed but still injured: the date slipped. Trust FPL for the
            -- next gameweek, then 50%, 75%, 90%, fit.
            WHEN pf.status = 'i'::text AND pf.return_date IS NOT NULL THEN
              CASE pf.gameweeks_ahead WHEN 0 THEN COALESCE(pf.chance_of_playing_next_round, 0)::numeric / 100.0 WHEN 1 THEN 0.50 WHEN 2 THEN 0.75 WHEN 3 THEN 0.90 ELSE 1::numeric END
            -- A doubt is about the next gameweek: FPL's chance then, and the remaining
            -- doubt halves each gameweek after (75% -> 88%, 94%; 50% -> 75%, 88%).
            WHEN pf.status = 'd'::text THEN
              1::numeric - (1::numeric - COALESCE(pf.chance_of_playing_next_round, 75)::numeric / 100.0) * power(0.5::numeric, pf.gameweeks_ahead::numeric)
            -- Injured, no return date: out for the next two gameweeks, then a slow
            -- rise to at most 60% (no data yet on how long these last).
            WHEN pf.status = 'i'::text THEN
              CASE WHEN pf.gameweeks_ahead <= 1 THEN 0::numeric ELSE LEAST(0.60, 0.15 * (pf.gameweeks_ahead - 1)::numeric) END
            ELSE 1::numeric
          END AS availability,
          CASE
            WHEN pf.status = 'a'::text THEN 'available'
            WHEN pf.status = ANY (ARRAY['u'::text, 'n'::text]) THEN 'unavailable'
            WHEN pf.status = 's'::text AND pf.return_date IS NOT NULL THEN 'suspended_until'
            WHEN pf.status = 's'::text THEN 'suspended_next'
            WHEN pf.return_date > CURRENT_DATE AND pf.kickoff_date < pf.return_date THEN 'before_return_date'
            WHEN pf.return_date > CURRENT_DATE THEN 'returning'
            WHEN pf.status = 'i'::text AND pf.return_date IS NOT NULL THEN 'return_date_passed'
            WHEN pf.status = 'd'::text THEN 'doubt'
            WHEN pf.status = 'i'::text THEN 'injured_no_date'
            ELSE 'other'
          END AS rule
     ) r;

select public.refresh_fpl_fixture_availability();

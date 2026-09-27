-- ============================================================================
-- Results missing from football-data.co.uk's Greek files (docs/history-backfill.md,
-- "European leagues"). source_name 'verified_web', as for other hand-added
-- results; no stats, cards 0 (NOT NULL), as the importer writes for rows
-- without them.
--
-- * Super League Greece 2018/19, Panathinaikos v Olympiacos, 17 March 2019:
--   the file has the fixture with no score. The match was suspended before
--   kick-off (a firework hit an Olympiacos player) and Olympiacos were
--   awarded a 0-3 win (Wikipedia, "Derby of the Eternal Enemies"; the
--   2018-19 table's Olympiacos 75 points needs it). Without it the season had
--   239 matches and league_standings flagged it 'curtailed', ranking on
--   points per game.
-- * Super League Greece 2024/25, relegation round, matchday 10 (22 May 2025):
--   missing from the file (all six clubs had 35 games, not 36). Scores from
--   ESPN / Soccerway / FIFA match centre, and they reproduce Wikipedia's
--   final play-out table exactly (points, goals for and against):
--   Levadiakos 3-2 Volos, Panetolikos 1-0 Panserraikos,
--   Athens Kallithea 3-0 Lamia.
--
-- Idempotent: on conflict (natural key) do nothing.
-- ============================================================================

insert into public.matches (league_id, season_id, home_team_id, away_team_id, match_date,
  full_time_home_goals, full_time_away_goals, full_time_result,
  home_yellow_cards, away_yellow_cards, home_red_cards, away_red_cards, source_name, source_file)
select l.league_id, s.season_id, h.team_id, a.team_id, v.match_date::date,
  v.hg, v.ag, case when v.hg > v.ag then 'H' when v.hg < v.ag then 'A' else 'D' end,
  0, 0, 0, 0, 'verified_web', v.note
from (values
  (2018, 'panathinaikos', 'olympiacos', '2019-03-17', 0, 3, 'Awarded 0-3 (match suspended before kick-off); European history load'),
  (2024, 'levadiakos', 'volos', '2025-05-22', 3, 2, 'Relegation round matchday 10, missing from football-data.co.uk; European history load'),
  (2024, 'panetolikos', 'panserraikos', '2025-05-22', 1, 0, 'Relegation round matchday 10, missing from football-data.co.uk; European history load'),
  (2024, 'athens-kallithea', 'lamia', '2025-05-22', 3, 0, 'Relegation round matchday 10, missing from football-data.co.uk; European history load')
) v(start_year, home_slug, away_slug, match_date, hg, ag, note)
join public.leagues l on l.code = 'G1'
join public.seasons s on s.start_year = v.start_year
join public.teams h on h.slug = v.home_slug
join public.teams a on a.slug = v.away_slug
on conflict (league_id, season_id, match_date, home_team_id, away_team_id) do nothing;

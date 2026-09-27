-- ============================================================================
-- Points deductions for the European league history (docs/history-backfill.md,
-- "European leagues")
--
-- Researched season by season from each league-season's Wikipedia article
-- (table footnotes, checked against the table's W/D/L arithmetic) for the
-- seasons whose computed league_standings table follows the official method:
-- one double (or, Switzerland 2016/17-2022/23, quadruple) round robin with no
-- split or play-offs in the data -- La Liga, Bundesliga, Serie A, Ligue 1,
-- Primeira Liga, Eredivisie, Super Lig, Eliteserien, Allsvenskan, Swiss
-- Super League to 2022/23, Ekstraklasa from 2020/21, Super League Greece
-- 2016/17-2018/19 (regular season only in the files) and the Belgian regular
-- seasons 2016/17-2022/23. Every deduction the official table applies is
-- loaded, whether or not it moves a club (as for England).
--
-- Moves positions: Serie A 2011/12 Atalanta (9th -> 12th), 2012/13 Siena
-- (18th -> 19th), 2014/15 Parma (19th -> 20th), 2022/23 Juventus (4th ->
-- 7th); Ligue 1 2012/13 AC Ajaccio (15th -> 17th); Super League Greece
-- 2017/18 and 2018/19 Panathinaikos; Eredivisie 2023/24 Vitesse (17th ->
-- 18th); Super Lig 2023/24 Kayserispor (11th -> 14th); Ekstraklasa 2020/21
-- Cracovia (11th -> 14th).
--
-- Ligue 1 2013/14: Nantes 2-0 Bastia (10 August 2013) was later awarded to
-- Bastia (Nantes fielded an ineligible player): the file, and matches, keep
-- the score as played, so the three points move by a -3 / +3 pair (points
-- is any non-zero adjustment). Bastia finish 10th and Nantes 13th, as the
-- official table has them. Found by the engsoccerdata comparison (its row
-- says 0-0) and confirmed by Eurosport / Foot01 reports of the LFP ruling.
--
-- Not loaded (see the docs): Lazio 2017/18 -1 and 2018/19 -2, shown by
-- Wikipedia's tables but not by a second source (Sporting Life) and moving
-- no club; deductions in split-format seasons (Austria, Belgium play-offs,
-- Denmark, Finland, Greece from 2019/20, Poland to 2019/20, Romania,
-- Scotland, Switzerland from 2023/24), whose official tables league_standings
-- cannot reproduce anyway.
--
-- Idempotent: skips a row already present (same league, season, team,
-- points and reason).
-- ============================================================================

insert into public.point_deductions (league_id, season_id, team_id, points, reason)
select l.league_id, s.season_id, t.team_id, v.points, v.reason
from (values
  ('I1', 2011, 'atalanta', -6, '2011-12 Italian football betting scandal'),
  ('I1', 2012, 'atalanta', -2, '2011-12 Italian football betting scandal'),
  ('I1', 2012, 'sampdoria', -1, '2011-12 Italian football betting scandal'),
  ('I1', 2012, 'torino', -1, '2011-12 Italian football betting scandal'),
  ('I1', 2012, 'siena', -6, '2011-12 Italian football betting scandal'),
  ('I1', 2014, 'parma', -7, 'Unpaid wages (1 + 2 + 4 points)'),
  ('I1', 2018, 'chievo', -3, 'False accounting'),
  ('I1', 2022, 'juventus', -10, 'Capital gains (plusvalenze) case'),
  ('F1', 2012, 'ajaccio', -2, 'Crowd incidents in a 2011-12 match against Lyon'),
  ('F1', 2013, 'nantes', -3, 'Nantes 2-0 Bastia (10 Aug 2013) awarded to Bastia: ineligible player (Abdoulaye Toure); score kept as played'),
  ('F1', 2013, 'bastia', 3, 'Nantes 2-0 Bastia (10 Aug 2013) awarded to Bastia: ineligible player (Abdoulaye Toure); score kept as played'),
  ('T1', 2022, 'kayserispor', -3, 'Turkish Football Federation decision'),
  ('T1', 2023, 'kayserispor', -3, 'Turkish Football Federation decision'),
  ('T1', 2023, 'istanbulspor', -3, 'Turkish Football Federation decision'),
  ('T1', 2024, 'adana-demirspor', -12, 'Turkish Football Federation decisions'),
  ('N1', 2023, 'vitesse', -18, 'Breach of KNVB licensing requirements'),
  ('G1', 2016, 'paok', -3, 'Failed to play the 2015-16 Greek Cup semi-final against Olympiacos'),
  ('G1', 2017, 'paok', -3, 'Court decision (11 March 2018 incident, match against AEK)'),
  ('G1', 2017, 'olympiacos', -3, 'Crowd behaviour against AEK, 4 February 2018'),
  ('G1', 2017, 'panathinaikos', -8, 'Crowd behaviour in a 2016-17 play-off match (2) and financial reasons (3 + 3)'),
  ('G1', 2018, 'paok', -2, 'Court decision'),
  ('G1', 2018, 'aek-athens', -3, 'Court decision'),
  ('G1', 2018, 'panathinaikos', -11, 'Financial reasons (6) and court decision (5)'),
  ('B1', 2016, 'standard-liege', -3, 'Match against Charleroi (4 December 2016) abandoned; both clubs given no points, score stood'),
  ('POL', 2020, 'cracovia', -5, 'Match-fixing in the 2003-04 II liga')
) v(code, start_year, slug, points, reason)
join public.leagues l on l.code = v.code
join public.seasons s on s.start_year = v.start_year
join public.teams t on t.slug = v.slug
where not exists (
  select 1 from public.point_deductions d
  where d.league_id = l.league_id and d.season_id = s.season_id and d.team_id = t.team_id
    and d.points = v.points and d.reason = v.reason);

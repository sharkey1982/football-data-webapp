-- ============================================================================
-- Split-format seasons: deductions, awarded results and results missing from
-- the files (docs/history-backfill.md, "Split formats").
--
-- 20260927140200 left these out because league_standings could not
-- reproduce split-format tables; with league_season_formats it can, and each
-- row below was found by comparing the new table with the season's
-- Wikipedia article (table footnotes and W/D/L arithmetic), then checked
-- against a second source where one was found.
--
-- point_deductions.effective_date matters for halved groups: a deduction in
-- force before the first post-split game (null = from the start) is halved
-- with the regular-season points; a later one is not.
--
-- Awarded results the files keep as played are handled as for Nantes /
-- Bastia (20260927140200): the score stays, the points move by a pair of
-- adjustments.
--
-- Missing results (source_name 'verified_web', no stats, cards 0):
-- * Belgium 2023/24 Europe play-offs, Standard Liege v Westerlo, 10 May
--   2024: not played (Standard supporters blocked the team bus), awarded 0-5
--   to Westerlo (Wikipedia; the official Europe play-off table needs it).
-- * Belgium 2025/26 relegation play-offs, Dender 2-1 La Louviere, 3 May
--   2026 (half-time 2-1): missing from the file (Sporza match report, FIFA
--   match centre); Dender finish on 25 points as officially.
-- * Romania 2019/20, Sepsi 4-0 Academica Clinceni, 10 December 2019: missing
--   from the file (ESPN). Without it the pair's first play-out meeting was
--   read as a regular-season game.
--
-- Idempotent: deductions skip an identical row; matches do nothing on the
-- natural key.
-- ============================================================================

insert into public.point_deductions (league_id, season_id, team_id, points, reason, effective_date)
select l.league_id, s.season_id, t.team_id, v.points, v.reason, v.effective_date::date
from (values
  ('AUT', 2019, 'lask', -4, 'Organised team training during the Covid-19 lockdown; applied after the halving', '2020-06-02'),
  ('AUT', 2022, 'austria-wien', -3, 'Licence condition (started the season on -3); before the halving', null),
  ('FIN', 2022, 'ac-oulu', -3, 'AC Oulu 1-0 Inter Turku (21 Aug 2022) awarded 0-3 to Inter: too few home-grown players; score kept as played', null),
  ('FIN', 2022, 'inter-turku', 3, 'AC Oulu 1-0 Inter Turku (21 Aug 2022) awarded 0-3 to Inter: too few home-grown players; score kept as played', null),
  ('G1', 2019, 'xanthi', -12, 'Multi-ownership (7) and share register not updated (5)', null),
  ('G1', 2019, 'panionios', -6, 'Deduction in the official regular-season table (17 points won, 11 credited)', null),
  ('G1', 2023, 'kifisia', 2, 'Kifisia 0-0 Volos (11 Feb 2024) awarded 3-0 to Kifisia; score kept as played', null),
  ('G1', 2023, 'volos', -1, 'Kifisia 0-0 Volos (11 Feb 2024) awarded 3-0 to Kifisia; score kept as played', null),
  ('POL', 2016, 'ruch-chorzow', -4, 'Financial problems; before the halving', null),
  ('POL', 2017, 'lechia-gdansk', -1, 'Licensing requirement not met', null),
  ('ROU', 2016, 'cfr-cluj', -6, 'Licensing requirements not met; before the halving', null),
  ('ROU', 2016, 'pandurii', -6, 'Licensing (3) and penalty (3); before the halving', null),
  ('ROU', 2016, 'acs-poli-timisoara', -14, 'Too few points the previous season (8) and licensing (6); before the halving', null),
  ('ROU', 2016, 'asa-targu-mures', -9, 'Licensing requirements not met; before the halving', null),
  ('ROU', 2019, 'astra-giurgiu', -3, 'Failed to obtain a UEFA licence; before the halving', null),
  ('ROU', 2021, 'gaz-metan-medias', -22, 'Financial reasons (regular season); before the halving', null),
  ('ROU', 2021, 'gaz-metan-medias', -50, 'Financial reasons (play-out); after the halving', '2022-03-11'),
  ('ROU', 2021, 'academica-clinceni', -44, 'Financial reasons (play-out); after the halving', '2022-03-11'),
  ('ROU', 2022, 'hermannstadt', -9, 'Deduction in the official regular-season table (41 points won, 32 credited); before the halving', null)
) v(code, start_year, slug, points, reason, effective_date)
join public.leagues l on l.code = v.code
join public.seasons s on s.start_year = v.start_year
join public.teams t on t.slug = v.slug
where not exists (
  select 1 from public.point_deductions d
  where d.league_id = l.league_id and d.season_id = s.season_id and d.team_id = t.team_id
    and d.points = v.points and d.reason = v.reason);

insert into public.matches (league_id, season_id, home_team_id, away_team_id, match_date,
  full_time_home_goals, full_time_away_goals, full_time_result,
  half_time_home_goals, half_time_away_goals, half_time_result,
  home_yellow_cards, away_yellow_cards, home_red_cards, away_red_cards, source_name, source_file)
select l.league_id, s.season_id, h.team_id, a.team_id, v.match_date::date,
  v.hg, v.ag, case when v.hg > v.ag then 'H' when v.hg < v.ag then 'A' else 'D' end,
  v.hthg, v.htag, case when v.hthg is null then null when v.hthg > v.htag then 'H' when v.hthg < v.htag then 'A' else 'D' end,
  0, 0, 0, 0, 'verified_web', v.note
from (values
  ('B1', 2023, 'standard-liege', 'westerlo', '2024-05-10', 0, 5, null::int, null::int, 'Europe play-offs: not played, awarded 0-5 to Westerlo; split-format tables'),
  ('B1', 2025, 'dender', 'la-louviere', '2026-05-03', 2, 1, 2, 1, 'Relegation play-offs, missing from football-data.co.uk; split-format tables'),
  ('ROU', 2019, 'sepsi', 'academica-clinceni', '2019-12-10', 4, 0, null, null, 'Regular season, missing from football-data.co.uk; split-format tables')
) v(code, start_year, home_slug, away_slug, match_date, hg, ag, hthg, htag, note)
join public.leagues l on l.code = v.code
join public.seasons s on s.start_year = v.start_year
join public.teams h on h.slug = v.home_slug
join public.teams a on a.slug = v.away_slug
on conflict (league_id, season_id, match_date, home_team_id, away_team_id) do nothing;

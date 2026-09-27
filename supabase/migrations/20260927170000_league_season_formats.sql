-- ============================================================================
-- LEAGUE SEASON FORMATS: one row per league-season whose official table is not
-- "total points over every game in the file".
--
-- league_standings (next migration) reads the 'split' rows to separate the
-- regular season from the championship / relegation groups, lock the groups,
-- halve points where the competition does, and leave European / relegation
-- play-off ties between league clubs out of the table (the matches stay in
-- matches). 'curtailed' rows override the automatic curtailed test;
-- 'regular_season_only' rows only document seasons whose files hold the
-- regular season alone (the view treats them like any other season).
--
-- How the view reads a 'split' row:
--   * regular_meetings: how often each pair of clubs meets before the split
--     (2 for a double round robin, 3 for 33 rounds of 12 clubs). A pair's
--     meetings in date order beyond that number are post-split games, so a
--     postponed regular-season game played after the split still counts as
--     regular season.
--   * Groups are the clubs that meet after the split. With knockout_ties,
--     only pairs of clubs sharing at least two post-split opponents link a
--     group, so a play-off tie between groups does not merge them; a game
--     between clubs of different groups, or a pair's meeting beyond its
--     group's usual number of post-split meetings, is a play-off tie and is
--     left out of the table.
--   * Groups rank by their clubs' average regular-season points per game:
--     group 1 (championship) above group 2 and so on, whatever the points.
--     merge_lower_groups ranks every group after the first together
--     (Denmark 2016/17-2019/20: two parallel qualification groups).
--   * halved_groups: groups that start the post-split phase with half their
--     regular-season points, rounded as halving_rounding says. Ties are
--     broken on the unrounded total (Belgium, Romania, Poland and Greece:
--     the rounded-up half point comes off first; Austria: the rounded-down
--     half point is added back), then goal difference and goals scored.
--     Deductions in force before the split (point_deductions.effective_date
--     null or before the first post-split game) are halved with the
--     regular-season points; later ones are not.
-- ============================================================================

create table public.league_season_formats (
  league_id bigint not null references public.leagues(league_id),
  season_id bigint not null references public.seasons(season_id),
  format text not null check (format in ('split', 'curtailed', 'regular_season_only')),
  regular_meetings smallint check (regular_meetings between 1 and 4),
  halved_groups smallint[],
  halving_rounding text check (halving_rounding in ('up', 'down')),
  knockout_ties boolean not null default false,
  merge_lower_groups boolean not null default false,
  curtailed_on_ppg boolean,
  notes text not null,
  source_url text,
  primary key (league_id, season_id),
  constraint league_season_formats_split_needs_meetings check (format <> 'split' or regular_meetings is not null),
  constraint league_season_formats_halving_pair check ((halved_groups is null) = (halving_rounding is null)),
  constraint league_season_formats_split_fields check (format = 'split' or (regular_meetings is null and halved_groups is null and not knockout_ties and not merge_lower_groups))
);

alter table public.league_season_formats enable row level security;
-- Read only through league_standings (owner rights); no direct grants to anon.

comment on table public.league_season_formats is
  'Per league-season table rules for split / play-off formats, curtailed seasons and regular-season-only files; read by league_standings.';

-- season_id is not chronological: look seasons up by start_year.
with l(code, league_id) as (select code, league_id from public.leagues),
s(start_year, season_id) as (select start_year, season_id from public.seasons),
v(code, start_year, format, regular_meetings, halved_groups, halving_rounding, knockout_ties, merge_lower_groups, curtailed_on_ppg, notes, source_url) as (values
  -- Austria: 22 rounds, two groups of six (double round robin), points halved and rounded down.
  ('AUT', 2018, 'split', 2, '{1,2}'::smallint[], 'down', true,  false, null::boolean, '22 rounds + championship and qualification groups of six; points halved (rounded down); Europa League play-off (semi-final, two-leg final) left out', 'https://en.wikipedia.org/wiki/2018%E2%80%9319_Austrian_Football_Bundesliga'),
  ('AUT', 2019, 'split', 2, '{1,2}', 'down', true,  false, null, '22 rounds + two groups of six; points halved (rounded down); LASK -4 after the halving; Europa League play-off left out', 'https://en.wikipedia.org/wiki/2019%E2%80%9320_Austrian_Football_Bundesliga'),
  ('AUT', 2020, 'split', 2, '{1,2}', 'down', true,  false, null, '22 rounds + two groups of six; points halved (rounded down); Europa League play-off left out', 'https://en.wikipedia.org/wiki/2020%E2%80%9321_Austrian_Football_Bundesliga'),
  ('AUT', 2021, 'split', 2, '{1,2}', 'down', true,  false, null, '22 rounds + two groups of six; points halved (rounded down); Conference League play-off left out', 'https://en.wikipedia.org/wiki/2021%E2%80%9322_Austrian_Football_Bundesliga'),
  ('AUT', 2022, 'split', 2, '{1,2}', 'down', true,  false, null, '22 rounds + two groups of six; points halved (rounded down); Conference League play-off left out', 'https://en.wikipedia.org/wiki/2022%E2%80%9323_Austrian_Football_Bundesliga'),
  ('AUT', 2023, 'split', 2, '{1,2}', 'down', true,  false, null, '22 rounds + two groups of six; points halved (rounded down); Conference League play-off left out', 'https://en.wikipedia.org/wiki/2023%E2%80%9324_Austrian_Football_Bundesliga'),
  ('AUT', 2024, 'split', 2, '{1,2}', 'down', false, false, null, '22 rounds + two groups of six; points halved (rounded down); the file has no play-off games', 'https://en.wikipedia.org/wiki/2024%E2%80%9325_Austrian_Football_Bundesliga'),
  ('AUT', 2025, 'split', 2, '{1,2}', 'down', false, false, null, '22 rounds + two groups of six; points halved (rounded down); the file has no play-off games', 'https://en.wikipedia.org/wiki/2025%E2%80%9326_Austrian_Football_Bundesliga'),
  -- Belgium
  ('B1', 2016, 'regular_season_only', null, null, null, false, false, null, 'File holds the 30-round regular season only; the play-offs (points halved) are not loaded, so the table is the regular-season table, not the final one', 'https://en.wikipedia.org/wiki/2016%E2%80%9317_Belgian_First_Division_A'),
  ('B1', 2017, 'regular_season_only', null, null, null, false, false, null, 'File holds the 30-round regular season only; the play-offs are not loaded', 'https://en.wikipedia.org/wiki/2017%E2%80%9318_Belgian_First_Division_A'),
  ('B1', 2018, 'regular_season_only', null, null, null, false, false, null, 'File holds the 30-round regular season only; the play-offs are not loaded', 'https://en.wikipedia.org/wiki/2018%E2%80%9319_Belgian_First_Division_A'),
  ('B1', 2019, 'curtailed', null, null, null, false, false, true, 'Stopped after 29 of 30 rounds (Covid); decided on points, which gives the same order as points per game', 'https://en.wikipedia.org/wiki/2019%E2%80%9320_Belgian_First_Division_A'),
  ('B1', 2020, 'regular_season_only', null, null, null, false, false, null, 'File holds the 34-round regular season only; the play-offs are not loaded', 'https://en.wikipedia.org/wiki/2020%E2%80%9321_Belgian_First_Division_A'),
  ('B1', 2021, 'regular_season_only', null, null, null, false, false, null, 'File holds the 34-round regular season only; the play-offs are not loaded (champions Club Brugge, not the regular-season leaders Union SG)', 'https://en.wikipedia.org/wiki/2021%E2%80%9322_Belgian_Pro_League'),
  ('B1', 2022, 'regular_season_only', null, null, null, false, false, null, 'File holds the 34-round regular season only; the play-offs are not loaded (champions Antwerp, not the regular-season leaders Genk)', 'https://en.wikipedia.org/wiki/2022%E2%80%9323_Belgian_Pro_League'),
  ('B1', 2023, 'split', 2, '{1,2}', 'up', true,  false, null, '30 rounds + Champions'' and Europe play-offs (six clubs each, points halved, rounded up) + relegation play-offs (four clubs, full points); European play-off Genk v Gent left out', 'https://en.wikipedia.org/wiki/2023%E2%80%9324_Belgian_Pro_League'),
  ('B1', 2024, 'split', 2, '{1,2}', 'up', false, false, null, '30 rounds + Champions'' and Europe play-offs (points halved, rounded up) + relegation play-offs (full points)', 'https://en.wikipedia.org/wiki/2024%E2%80%9325_Belgian_Pro_League'),
  ('B1', 2025, 'split', 2, '{1,2}', 'up', false, false, null, '30 rounds + Champions'' and Europe play-offs (points halved, rounded up) + relegation play-offs (full points)', 'https://en.wikipedia.org/wiki/2025%E2%80%9326_Belgian_Pro_League'),
  -- Denmark
  ('DNK', 2016, 'split', 2, null, null, true, true,  null, '26 rounds + championship round (six clubs) + two qualification groups of four, full points; the qualification groups are ranked together on points (the official table leaves 7-14 to the play-offs); play-off ties left out', 'https://en.wikipedia.org/wiki/2016%E2%80%9317_Danish_Superliga'),
  ('DNK', 2017, 'split', 2, null, null, true, true,  null, '26 rounds + championship round + two qualification groups of four, full points; groups 2 and 3 ranked together; play-off ties left out', 'https://en.wikipedia.org/wiki/2017%E2%80%9318_Danish_Superliga'),
  ('DNK', 2018, 'split', 2, null, null, true, true,  null, '26 rounds + championship round + two qualification groups of four, full points; groups 2 and 3 ranked together; play-off ties left out', 'https://en.wikipedia.org/wiki/2018%E2%80%9319_Danish_Superliga'),
  ('DNK', 2019, 'split', 2, null, null, true, true,  null, '26 rounds + championship round + two qualification groups of four, full points; groups 2 and 3 ranked together; play-off ties left out', 'https://en.wikipedia.org/wiki/2019%E2%80%9320_Danish_Superliga'),
  ('DNK', 2020, 'split', 2, null, null, true, false, null, '22 rounds + two groups of six, full points; European play-off final left out', 'https://en.wikipedia.org/wiki/2020%E2%80%9321_Danish_Superliga'),
  ('DNK', 2021, 'split', 2, null, null, true, false, null, '22 rounds + two groups of six, full points; European play-off final left out', 'https://en.wikipedia.org/wiki/2021%E2%80%9322_Danish_Superliga'),
  ('DNK', 2022, 'split', 2, null, null, true, false, null, '22 rounds + two groups of six, full points; European play-off final left out', 'https://en.wikipedia.org/wiki/2022%E2%80%9323_Danish_Superliga'),
  ('DNK', 2023, 'split', 2, null, null, true, false, null, '22 rounds + two groups of six, full points; European play-off final left out', 'https://en.wikipedia.org/wiki/2023%E2%80%9324_Danish_Superliga'),
  ('DNK', 2024, 'split', 2, null, null, false, false, null, '22 rounds + two groups of six, full points', 'https://en.wikipedia.org/wiki/2024%E2%80%9325_Danish_Superliga'),
  ('DNK', 2025, 'split', 2, null, null, false, false, null, '22 rounds + two groups of six, full points', 'https://en.wikipedia.org/wiki/2025%E2%80%9326_Danish_Superliga'),
  -- Finland (calendar years, stored under the season that starts that year)
  ('FIN', 2019, 'split', 2, null, null, true,  false, null, '22 rounds + championship and challenger series (six clubs, single round robin), full points; Europa League play-off ties left out', 'https://en.wikipedia.org/wiki/2019_Veikkausliiga'),
  ('FIN', 2021, 'split', 2, null, null, false, false, null, '22 rounds + two groups of six (single round robin), full points', 'https://en.wikipedia.org/wiki/2021_Veikkausliiga'),
  ('FIN', 2022, 'split', 2, null, null, true,  false, null, '22 rounds + two groups of six (single round robin), full points; Conference League play-off ties left out', 'https://en.wikipedia.org/wiki/2022_Veikkausliiga'),
  ('FIN', 2023, 'split', 2, null, null, true,  false, null, '22 rounds + two groups of six (single round robin), full points; Conference League play-off ties left out', 'https://en.wikipedia.org/wiki/2023_Veikkausliiga'),
  ('FIN', 2024, 'split', 2, null, null, true,  false, null, '22 rounds + two groups of six (single round robin), full points; Conference League play-off ties left out', 'https://en.wikipedia.org/wiki/2024_Veikkausliiga'),
  ('FIN', 2025, 'split', 2, null, null, false, false, null, '22 rounds + championship group (double round robin) and relegation group (single round robin), full points', 'https://en.wikipedia.org/wiki/2025_Veikkausliiga'),
  ('FIN', 2026, 'split', 2, null, null, false, false, null, '22 rounds + two groups of six, full points (season in progress; set knockout_ties if the file gains play-off ties)', 'https://en.wikipedia.org/wiki/2026_Veikkausliiga'),
  -- Greece
  ('G1', 2016, 'regular_season_only', null, null, null, false, false, null, '30-round league; the European play-offs (places 2-5) are not in the file and do not change the league table', 'https://en.wikipedia.org/wiki/2016%E2%80%9317_Super_League_Greece'),
  ('G1', 2017, 'regular_season_only', null, null, null, false, false, null, '30-round league; the European play-offs are not in the file', 'https://en.wikipedia.org/wiki/2017%E2%80%9318_Super_League_Greece'),
  ('G1', 2018, 'regular_season_only', null, null, null, false, false, null, '30-round league; the European play-offs are not in the file', 'https://en.wikipedia.org/wiki/2018%E2%80%9319_Super_League_Greece'),
  ('G1', 2019, 'split', 2, null, null, false, false, null, '26 rounds + play-off (six clubs, double round robin) and play-out (eight clubs, single round robin), full points; Xanthi -12', 'https://en.wikipedia.org/wiki/2019%E2%80%9320_Super_League_Greece'),
  ('G1', 2020, 'split', 2, null, null, false, false, null, '26 rounds + play-off (six) and play-out (eight), full points', 'https://en.wikipedia.org/wiki/2020%E2%80%9321_Super_League_Greece'),
  ('G1', 2021, 'split', 2, null, null, false, false, null, '26 rounds + play-off (six) and play-out (eight), full points', 'https://en.wikipedia.org/wiki/2021%E2%80%9322_Super_League_Greece'),
  ('G1', 2022, 'split', 2, null, null, false, false, null, '26 rounds + play-off (six) and play-out (eight), full points', 'https://en.wikipedia.org/wiki/2022%E2%80%9323_Super_League_Greece'),
  ('G1', 2023, 'split', 2, null, null, false, false, null, '26 rounds + play-off (six) and play-out (eight), full points', 'https://en.wikipedia.org/wiki/2023%E2%80%9324_Super_League_Greece'),
  ('G1', 2024, 'split', 2, '{2}', 'up', false, false, null, '26 rounds + championship play-off (places 1-4, full points), Europe play-off (5-8, points halved) and play-out (9-14, full points)', 'https://en.wikipedia.org/wiki/2024%E2%80%9325_Super_League_Greece'),
  ('G1', 2025, 'split', 2, '{2}', 'up', false, false, null, '26 rounds + championship play-off (1-4, full points), Europe play-off (5-8, points halved) and play-out (9-14, full points)', 'https://en.wikipedia.org/wiki/2025%E2%80%9326_Super_League_Greece'),
  -- Poland (ESA-37: 30 rounds + two groups of eight, single round robin)
  ('POL', 2016, 'split', 2, '{1,2}', 'up', false, false, null, '30 rounds + championship and relegation rounds (eight clubs, single round robin); points halved (rounded up)', 'https://en.wikipedia.org/wiki/2016%E2%80%9317_Ekstraklasa'),
  ('POL', 2017, 'split', 2, null, null, false, false, null, '30 rounds + championship and relegation rounds (eight clubs), full points', 'https://en.wikipedia.org/wiki/2017%E2%80%9318_Ekstraklasa'),
  ('POL', 2018, 'split', 2, null, null, false, false, null, '30 rounds + championship and relegation rounds (eight clubs), full points', 'https://en.wikipedia.org/wiki/2018%E2%80%9319_Ekstraklasa'),
  ('POL', 2019, 'split', 2, null, null, false, false, null, '30 rounds + championship and relegation rounds (eight clubs), full points', 'https://en.wikipedia.org/wiki/2019%E2%80%9320_Ekstraklasa'),
  -- Romania: points halved (rounded up) in both groups
  ('ROU', 2016, 'split', 2, '{1,2}', 'up', false, false, null, '26 rounds + play-off (six, double round robin) and play-out (eight, double round robin); points halved (rounded up); deductions before the halving', 'https://en.wikipedia.org/wiki/2016%E2%80%9317_Liga_I'),
  ('ROU', 2017, 'split', 2, '{1,2}', 'up', false, false, null, '26 rounds + play-off (six) and play-out (eight); points halved (rounded up)', 'https://en.wikipedia.org/wiki/2017%E2%80%9318_Liga_I'),
  ('ROU', 2018, 'split', 2, '{1,2}', 'up', false, false, null, '26 rounds + play-off (six) and play-out (eight); points halved (rounded up)', 'https://en.wikipedia.org/wiki/2018%E2%80%9319_Liga_I'),
  ('ROU', 2019, 'split', 2, '{1,2}', 'up', false, false, null, '26 rounds + play-off (six) and play-out (eight); points halved (rounded up); seven games cancelled (Covid), ranked on points', 'https://en.wikipedia.org/wiki/2019%E2%80%9320_Liga_I'),
  ('ROU', 2020, 'split', 2, '{1,2}', 'up', true,  false, null, '30 rounds + play-off (six, double round robin) and play-out (ten, single round robin); points halved (rounded up); Conference League play-off ties left out', 'https://en.wikipedia.org/wiki/2020%E2%80%9321_Liga_I'),
  ('ROU', 2021, 'split', 2, '{1,2}', 'up', true,  false, null, '30 rounds + play-off (six) and play-out (ten); points halved (rounded up); Conference League play-off left out', 'https://en.wikipedia.org/wiki/2021%E2%80%9322_Liga_I'),
  ('ROU', 2022, 'split', 2, '{1,2}', 'up', true,  false, null, '30 rounds + play-off (six) and play-out (ten); points halved (rounded up); Conference League play-off left out', 'https://en.wikipedia.org/wiki/2022%E2%80%9323_Liga_I'),
  ('ROU', 2023, 'split', 2, '{1,2}', 'up', true,  false, null, '30 rounds + play-off (six) and play-out (ten); points halved (rounded up); Conference League play-off ties left out', 'https://en.wikipedia.org/wiki/2023%E2%80%9324_Liga_I'),
  ('ROU', 2024, 'split', 2, '{1,2}', 'up', false, false, null, '30 rounds + play-off (six) and play-out (ten); points halved (rounded up)', 'https://en.wikipedia.org/wiki/2024%E2%80%9325_Liga_I'),
  ('ROU', 2025, 'split', 2, '{1,2}', 'up', true,  false, null, '30 rounds + play-off (six) and play-out (ten); points halved (rounded up); Conference League play-off ties left out', 'https://en.wikipedia.org/wiki/2025%E2%80%9326_Liga_I'),
  -- Scotland: 33 rounds + split (five rounds), full points, halves locked
  ('SC0', 2016, 'split', 3, null, null, false, false, null, '33 rounds + top and bottom six (five rounds); halves locked', 'https://en.wikipedia.org/wiki/2016%E2%80%9317_Scottish_Premiership'),
  ('SC0', 2017, 'split', 3, null, null, false, false, null, '33 rounds + top and bottom six; halves locked', 'https://en.wikipedia.org/wiki/2017%E2%80%9318_Scottish_Premiership'),
  ('SC0', 2018, 'split', 3, null, null, false, false, null, '33 rounds + top and bottom six; halves locked', 'https://en.wikipedia.org/wiki/2018%E2%80%9319_Scottish_Premiership'),
  ('SC0', 2019, 'curtailed', null, null, null, false, false, true, 'Stopped after 29-30 games (Covid) before the split; decided on points per game', 'https://en.wikipedia.org/wiki/2019%E2%80%9320_Scottish_Premiership'),
  ('SC0', 2020, 'split', 3, null, null, false, false, null, '33 rounds + top and bottom six; halves locked', 'https://en.wikipedia.org/wiki/2020%E2%80%9321_Scottish_Premiership'),
  ('SC0', 2021, 'split', 3, null, null, false, false, null, '33 rounds + top and bottom six; halves locked', 'https://en.wikipedia.org/wiki/2021%E2%80%9322_Scottish_Premiership'),
  ('SC0', 2022, 'split', 3, null, null, false, false, null, '33 rounds + top and bottom six; halves locked', 'https://en.wikipedia.org/wiki/2022%E2%80%9323_Scottish_Premiership'),
  ('SC0', 2023, 'split', 3, null, null, false, false, null, '33 rounds + top and bottom six; halves locked', 'https://en.wikipedia.org/wiki/2023%E2%80%9324_Scottish_Premiership'),
  ('SC0', 2024, 'split', 3, null, null, false, false, null, '33 rounds + top and bottom six; halves locked', 'https://en.wikipedia.org/wiki/2024%E2%80%9325_Scottish_Premiership'),
  ('SC0', 2025, 'split', 3, null, null, false, false, null, '33 rounds + top and bottom six; halves locked', 'https://en.wikipedia.org/wiki/2025%E2%80%9326_Scottish_Premiership'),
  -- Switzerland from 2023/24: 12 clubs, 33 rounds + split (five rounds), full points
  ('SWZ', 2023, 'split', 3, null, null, false, false, null, '33 rounds + championship and relegation groups of six (five rounds); halves locked', 'https://en.wikipedia.org/wiki/2023%E2%80%9324_Swiss_Super_League'),
  ('SWZ', 2024, 'split', 3, null, null, false, false, null, '33 rounds + championship and relegation groups of six; halves locked', 'https://en.wikipedia.org/wiki/2024%E2%80%9325_Swiss_Super_League'),
  ('SWZ', 2025, 'split', 3, null, null, false, false, null, '33 rounds + championship and relegation groups of six; halves locked', 'https://en.wikipedia.org/wiki/2025%E2%80%9326_Swiss_Super_League'),
  -- Curtailed seasons already caught by the automatic test (recorded for completeness)
  ('F1', 2019, 'curtailed', null, null, null, false, false, true, 'Ended in April 2020 (Covid) after 28 rounds; decided on points per game', 'https://en.wikipedia.org/wiki/2019%E2%80%9320_Ligue_1'),
  ('N1', 2019, 'curtailed', null, null, null, false, false, true, 'Abandoned after 26 rounds (Covid): no champion, promotion or relegation; European places from the table of 8 March 2020', 'https://en.wikipedia.org/wiki/2019%E2%80%9320_Eredivisie')
)
insert into public.league_season_formats (league_id, season_id, format, regular_meetings, halved_groups, halving_rounding, knockout_ties, merge_lower_groups, curtailed_on_ppg, notes, source_url)
select l.league_id, s.season_id, v.format, v.regular_meetings, v.halved_groups, v.halving_rounding, v.knockout_ties, v.merge_lower_groups, v.curtailed_on_ppg, v.notes, v.source_url
from v join l using (code) join s using (start_year);

do $$
begin
  if (select count(*) from public.league_season_formats) <> 74 then
    raise exception 'expected 74 league_season_formats rows, got %', (select count(*) from public.league_season_formats);
  end if;
end $$;

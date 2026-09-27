-- ============================================================================
-- Catalogue entries for split-format league tables (docs/history-backfill.md,
-- "Split formats"). Run after select public.meta_refresh_flow().
-- ============================================================================

update public.meta_flow_nodes set
  layer = 'source', status = 'current', is_public = false, ai_relevant = true,
  purpose = 'Rules for league-seasons whose official table is not total points over every game in the file: one row per league + season. format ''split'' (61 rows: Scotland; Switzerland from 2023/24; Austria from 2018/19; Belgium 2023/24 on; Denmark, Greece from 2019/20, Poland 2016/17-2019/20, Romania, Finland 2019 and 2021 on) gives regular_meetings (how often each pair meets before the split), group_sizes and group_games per post-split group, halved_groups and halving_rounding (Austria down; Belgium, Greece''s Europe play-off, Poland 2016/17 and Romania up), and tiebreak (head_to_head, regular_position, regular_points or goal_difference); ''curtailed'' overrides the automatic curtailed test (Scotland 2019/20 on points per game); ''regular_season_only'' documents files holding only a regular season (Belgium 2016/17-2022/23 except 2019/20, Greece 2016/17-2018/19). notes and source_url give the format and the Wikipedia season article it was checked against. Read by league_standings (owner rights; no direct grants).',
  refresh_note = 'Manual SQL: add a row for each new season of a split-format league before its split (check_model_integrity split_formats_configured warns once a season is past its split without one). Formats change: Austria stops halving points from 2026/27; Belgium has 18 clubs in 2026/27.',
  purpose_reviewed_at = now()
where node_key = 'object:league_season_formats';

update public.meta_flow_nodes set
  purpose = 'Computed league tables from results for every domestic league and season: one row per league x season x team with position, pyramid_position, P/W/D/L, goals, clean sheets, points (after point_deductions), PPG and full home/away splits, plus split_group and split_adjustment. league_name is the division''s name in that season (league_name_for_season, e.g. First Division for E1 before 2004/05); season_start_year is the chronological sort key. Curtailed past seasons are ranked on points per game (fewer games than a double round robin, or league_season_formats.curtailed_on_ppg, e.g. Scotland 2019/20); is_final is false for the current season (latest by start_year with results). Split formats (league_season_formats format ''split'': Scotland, Switzerland from 2023/24, Austria from 2018/19, Belgium from 2023/24, Denmark, Greece from 2019/20, Poland to 2019/20, Romania, Finland from 2019) follow the official table: post-split groups are locked (split_group 1 ranks above 2 whatever the points), halved groups carry half their regular-season points (split_adjustment is the points removed; points = points_won + deduction + split_adjustment), ties go to each league''s rule (head-to-head, regular-season position or points), and European / relegation play-off ties between league clubs are left out of every column (they stay in matches). Checked against Wikipedia for all 61 split seasons: every points total matches except Romania 2021/22 Academica Clinceni (-37 against -43); three pairs level on points are in the other order (docs/history-backfill.md). Caveats: the ''tier'' column is just league_id (correct for English divisions 1-5, wrong for other countries, e.g. La Liga shows 13); pyramid_position assumes lower league_id = higher division within a country; outside split seasons tie-breaks are GD, GF, then name, except the Football League (E1-E3) up to 1998/99, which used goals scored before goal difference; head-to-head is not modelled there (e.g. Serie A 2017/18 Inter/Lazio). Belgian files 2016/17-2022/23 hold only the regular season, so those tables are regular-season tables (Belgium 2021/22 and 2022/23 champions differ). The League Table page (getLeagueTable) computes its own table from matches and does not use this view. point_deductions covers England 1992/93 onwards and the European history. Read by team history panels.',
  refresh_note = 'Computed on read (about 0.8 s for a full scan, same as before the split logic). Page load: team history panels via src/lib/teamHistoryApi.ts (ordered by season_start_year); AI Lab get_league_table.',
  purpose_reviewed_at = now()
where node_key = 'object:league_standings';

update public.meta_flow_nodes set
  purpose = 'AI Lab tool get_league_table: league_standings for a competition and season (points include deductions and, in split formats, the halving shown in split_adjustment; split_group marks the locked post-split groups; home/away W-D-L). Observed. Service role only.',
  purpose_reviewed_at = now()
where node_key = 'function:ai_tool_get_league_table(args jsonb)';

update public.meta_flow_nodes set
  purpose = purpose || ' Also split_formats_configured (warning): a league with a league_season_formats split row in an earlier season has a season past its split (some pair has met more often than the regular season allows) with no row, so league_standings ranks it on total points.',
  purpose_reviewed_at = now()
where node_key = 'function:check_model_integrity()' and purpose not like '%split_formats_configured%';

update public.meta_flow_nodes set
  purpose = purpose || ' Split-format seasons (league_season_formats) have their deductions and awarded-result adjustments too (e.g. Romania 2016/17 licensing deductions, Oulu -3 / Inter Turku +3 in Veikkausliiga 2022); in halved groups a deduction whose effective_date is null or before the first post-split game is halved with the regular-season points, a later one is not.',
  purpose_reviewed_at = now()
where node_key = 'object:point_deductions' and purpose not like '%Split-format seasons%';

update public.meta_flow_nodes set
  refresh_note = refresh_note || ' Three results missing from football-data.co.uk were added as source_name ''verified_web'' for the split-format tables: Standard Liege 0-5 Westerlo (awarded, Belgium 2023/24), Dender 2-1 La Louviere (Belgium 2025/26), Sepsi 4-0 Academica Clinceni (Romania 2019/20).',
  purpose_reviewed_at = now()
where node_key = 'object:matches' and refresh_note not like '%split-format tables%';

-- ============================================================================
-- Catalogue entries for the European league history load
-- (docs/history-backfill.md, "European leagues"). Run after
-- select public.meta_refresh_flow(). Appends, guarded, so entries edited by
-- the parallel English/National League loads keep their text.
-- ============================================================================

update public.meta_flow_nodes set
  layer = 'scratch', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Scratch staging for the European history load: one row per match row in each source file -- football-data.co.uk SP1/D1/I1/F1 2011/12-2020/21, P1/B1/T1/G1/N1/SC0 2016/17-2024/25 and the all-seasons files AUT/DNK/NOR/POL/ROU/SWE/SWZ/FIN 2016(/17)-2024(/25), plus engsoccerdata''s tier-1 rows for the ten main-file leagues -- with date, names, score, whether stats/odds were present and (all-seasons files) the Season value and any play-off exclusion. Used to map club names and cross-check results. Kept apart from historic_source_rows (English load). Not read by the site or the model; drop once the load is signed off.',
  refresh_note = 'Written by scripts/history_backfill_europe.py stage-eu (manual workflow history-backfill-europe.yml); each league-season''s rows are replaced on re-run. One-off.',
  purpose_reviewed_at = now()
where node_key = 'object:historic_source_rows_europe';

update public.meta_flow_nodes set
  purpose_reviewed_at = now()
where node_key = 'function:get_countries_by_relevance()';

update public.meta_flow_nodes set
  refresh_note = refresh_note || ' European top flights were extended once by scripts/history_backfill_europe.py (manual workflow history-backfill-europe.yml): La Liga, Bundesliga, Serie A and Ligue 1 from 2011/12; P1, B1, T1, G1, N1, SC0 and the eight all-seasons leagues (AUT, DNK, NOR, POL, ROU, SWE, SWZ, FIN) from 2016(/17), all from football-data.co.uk, no raw rows or odds archived; four Greek results missing from the files were added as source_name ''verified_web''.',
  purpose_reviewed_at = now()
where node_key = 'object:matches' and refresh_note not like '%history_backfill_europe.py%';

update public.meta_flow_nodes set
  refresh_note = refresh_note || ' Also one row per league-season from the one-off European history load (scripts/history_backfill_europe.py; error_message starts ''history <label>'').',
  purpose_reviewed_at = now()
where node_key = 'object:match_import_runs' and refresh_note not like '%history_backfill_europe.py%';

update public.meta_flow_nodes set
  purpose = purpose || ' The European history load added 161 football-data.co.uk spellings; old spellings of renamed clubs point at the current club (e.g. "Waasland-Beveren" -> SK Beveren, "Erzurum BB" -> Erzurumspor FK, "Viitorul Constanta" -> Farul Constanta), and same-looking names of different clubs stay apart ("Ajaccio" / "Ajaccio GFCO", "U Craiova" / "U Craiova 1948", "Gaziantep" / "Gaziantepspor").',
  purpose_reviewed_at = now()
where node_key = 'object:team_aliases' and purpose not like '%European history load%';

update public.meta_flow_nodes set
  purpose = purpose || ' Also holds adjustments for the European history (2011/12 on for the big five, 2016/17 on for other non-split tables), including one positive entry: Bastia +3 / Nantes -3 in Ligue 1 2013/14, a match awarded after it was played.',
  purpose_reviewed_at = now()
where node_key = 'object:point_deductions' and purpose not like '%European history%';

update public.meta_flow_nodes set
  purpose = purpose || ' European split and play-off formats (Scotland, Belgium from 2023/24, Austria from 2018/19, Denmark, Greece from 2019/20, Poland to 2019/20, Romania, Finland from 2019, Switzerland from 2023/24) are ranked on total points over every game in the file, including play-off rounds and post-season European play-off ties: official tables lock the halves after the split and some halve points, so positions (and, in some seasons, the champion) differ from the official table. Scotland 2019/20 was officially decided on points per game but is not flagged curtailed (more games than a double round robin).',
  purpose_reviewed_at = now()
where node_key = 'object:league_standings' and purpose not like '%European split%';

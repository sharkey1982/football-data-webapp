-- ============================================================================
-- Keep the historical data layer fresh and guarded, and catalogue today's
-- new objects (odds repair, deadline player state, history layer).
--
-- * pg_cron 'refresh-history-derived' at 06:50 and 12:50 UTC: after the
--   English (06:00) and international (06:20) imports. Only league-seasons
--   whose matches or deductions changed are rebuilt (a no-op run takes ~13 s,
--   mostly the two materialised-view refreshes).
-- * check_model_integrity(): 'history_snapshot_reconciles' fails if any
--   team's latest team_match_snapshot row disagrees with league_standings
--   (played, W/D/L, goals for/against, points), split formats excluded.
--   At creation: 6,495 team-seasons, 0 differences.
-- ============================================================================

select cron.schedule('refresh-history-derived', '50 6,12 * * *', $$select public.refresh_history_derived(false);$$)
where not exists (select 1 from cron.job where jobname = 'refresh-history-derived');

do $$
declare
  v_def text;
  v_anchor text := '-- Catalogue (2026-09-26)';
  v_add text := $add$-- History layer (2026-09-27): each team's latest team_match_snapshot row
  -- must equal its league_standings row. Split formats excluded (halving).
  select 'history_snapshot_reconciles', case when n = 0 then 'ok' else 'failed' end, n,
    'Team-seasons whose latest team_match_snapshot row disagrees with league_standings (run refresh_history_derived(true)): ' || coalesce(names, '')
  from (select count(*) n, string_agg(l.league_id || '/' || l.season_id || '/' || l.team_id, ', ') filter (where rn <= 10) names
        from (select s.*, row_number() over () rn
              from (select distinct on (league_id, season_id, team_id) * from public.team_match_snapshot
                    order by league_id, season_id, team_id, matches_played desc) s
              join public.league_standings ls using (league_id, season_id, team_id)
              where not exists (select 1 from public.league_season_formats f
                                where f.league_id = s.league_id and f.season_id = s.season_id and f.format = 'split')
                and (ls.played <> s.matches_played or ls.won <> s.won or ls.drawn <> s.drawn or ls.lost <> s.lost
                     or ls.goals_for <> s.cum_goals_for or ls.goals_against <> s.cum_goals_against or ls.points <> s.points)) l) x
  union all
  $add$;
begin
  select pg_get_functiondef('public.check_model_integrity'::regproc) into v_def;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'check_model_integrity anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor, v_add || v_anchor);
end $$;

-- Catalogue -------------------------------------------------------------------
select public.meta_refresh_flow();

update public.meta_flow_nodes set
  layer = 'model', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'Historical data layer primitive: one row per team per league match (league + season + team + matches_played) with the match (date, venue, opponent, score, result) and the cumulative record after it: W/D/L, goals for/against, goal difference, points won, deduction to date and points; position_on_date = position in the real table after that date''s matches (teams yet to play count as 0); position_at_played = rank among every team''s record after the same number of matches. Deductions count from effective_date; undated ones from the team''s latest row, so the latest row equals league_standings (guarded by check_model_integrity history_snapshot_reconciles). Order points, goal difference, goals scored (goals scored first in EFL tiers 2-4 to 1998/99); ties share a rank. Split-format seasons are raw totals over every game (official table in league_standings). Powers What Happened Next?, Historic Pace, trajectories, Ghost Table, table reliability and streaks (docs/methodology/history.md). Observed data, derived.',
  refresh_note = 'refresh_history_derived() via pg_cron refresh-history-derived (50 6,12 * * *): rebuilds only league-seasons whose matches or deductions changed; refresh_history_derived(true) rebuilds all 381 (about 3 minutes).',
  purpose_reviewed_at = now()
where node_key = 'object:team_match_snapshot';

update public.meta_flow_nodes set
  layer = 'model', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'league_standings materialised for league competitions, one row per league + season + team, plus season context and outcomes: games_in_season, clubs, comparable_group (clubs x games, e.g. 20x38), champion, top_four, top_six (final seasons only), next_league_id, relegated and promoted. English leagues 1-5 read movement from where the club plays next season; a tier 1-4 club absent from the data next season is NULL (not guessed), a National League club absent is relegated. Other countries: only top flights are loaded, so relegated means absent next season. NULL for the current season and when next season is not loaded. Powers Club History, Record Book, percentiles and SEO season pages.',
  refresh_note = 'Refreshed (concurrently) by refresh_history_derived() (pg_cron 50 6,12 * * *).',
  purpose_reviewed_at = now()
where node_key = 'object:team_season_summary';

update public.meta_flow_nodes set
  layer = 'model', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'Season fingerprint per league + season: clubs, games, comparable_group, is_final, curtailed, split_format, covid_affected (2019/20 and 2020/21), matches, goals per game, home/away goals per game, H/D/A shares, goalless share, clean-sheet share, average winning margin, home PPG advantage (home minus away points per game), champion points and PPG, highest relegated and lowest safe points, points spread, PPG standard deviation, Noll-Scully ratio, and half-time / stats coverage shares. From team_season_summary and matches. Powers League Lab and season fingerprints.',
  refresh_note = 'Refreshed (concurrently) by refresh_history_derived() after team_season_summary.',
  purpose_reviewed_at = now()
where node_key = 'object:league_season_summary';

update public.meta_flow_nodes set
  layer = 'pipeline', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Rebuilds team_match_snapshot for one league + season (delete and insert). Service role only. Called by refresh_history_derived().',
  refresh_note = 'Internal; ~0.1-0.5 s per league-season.',
  purpose_reviewed_at = now()
where node_key = 'function:refresh_team_match_snapshot(p_league_id bigint, p_season_id bigint)';

update public.meta_flow_nodes set
  layer = 'pipeline', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Refreshes the historical data layer: rebuilds team_match_snapshot for league-seasons whose matches changed (row count or updated_at) or gained a deduction since the last build (all of them with p_force), then refreshes team_season_summary and league_season_summary concurrently. Returns league-seasons rebuilt, rows and seconds.',
  refresh_note = 'pg_cron refresh-history-derived (50 6,12 * * *). Run with true after editing point_deductions effective dates or team mappings.',
  purpose_reviewed_at = now()
where node_key = 'function:refresh_history_derived(p_force boolean)';

update public.meta_flow_nodes set
  layer = 'fantasy', status = 'current', is_public = false, ai_relevant = true,
  purpose = 'What FPL showed at each gameweek deadline: one row per season x gameweek x snapshot_kind x player with status, chance of playing, news, price, ownership, form, FPL''s own ep_this / ep_next, transfers this gameweek, total points and minutes, source_updated_at (when that fpl_players row was last refreshed) and the raw API payload. Append-only (UPDATE and DELETE refused). The leakage-free record of the market state a manager saw, paired with fpl_projection_snapshots (what the model said). Private (research use).',
  refresh_note = 'Written by snapshot_fpl_projections() with every snapshot; before a pre_deadline capture snapshot_due_fpl_projections() runs private.refresh_fpl() first. Started 27 Sep 2026 (GW6 manual baseline).',
  purpose_reviewed_at = now()
where node_key = 'object:fpl_deadline_player_state';

update public.meta_flow_nodes set
  purpose = 'Copies the current fpl_player_projections (all model versions), the fixtures'' predicted goals and FPL''s player state (fpl_players into fpl_deadline_player_state) for one FPL gameweek into the append-only snapshot tables, tagged with snapshot_kind (''pre_deadline'', ''late'' or ''manual''). Idempotent (on conflict do nothing). Returns counts.',
  purpose_reviewed_at = now()
where node_key = 'function:snapshot_fpl_projections(p_season_id bigint, p_event integer, p_kind text)';

update public.meta_flow_nodes set
  purpose = 'Scheduler for FPL snapshots: for gameweeks whose deadline is between 2 days ago and 60 minutes ahead and that have no ''pre_deadline''/''late'' snapshot yet, refreshes FPL data (private.refresh_fpl(); a failure is reported, not raised) and takes a ''pre_deadline'' snapshot if before the deadline, or a ''late'' one if the deadline passed but no match has kicked off. Returns a JSON list of what was captured.',
  purpose_reviewed_at = now()
where node_key = 'function:snapshot_due_fpl_projections()';

update public.meta_flow_nodes set
  purpose = 'Unpivots bookmaker prices held in raw football-data.co.uk rows (source_match_rows.raw_data) into match_odds for matches with no odds yet: 1X2 (B365, BW, IW, PS = Pinnacle, WH, VC, Max, Avg, BFE = Betfair exchange), over/under 2.5 (B365, Max, Avg, P = Pinnacle, BFE) and Asian handicap (B365, Max, Avg, P, BFE; line from AHh/AHCh, or the bookmaker''s own line column in 2003-05 files; home price in price_home, away in price_away), opening and closing, matched to matches via team_aliases. Insert-only (ON CONFLICT DO NOTHING); returns rows inserted.',
  purpose_reviewed_at = now()
where node_key = 'function:backfill_match_odds()';

update public.meta_flow_nodes set
  purpose = 'Bookmaker odds for archived matches: one row per (match_id, source_name, market, bookmaker, is_closing), markets ''1x2'' (price_home/draw/away), ''ou25'' (price_over/under, line 2.5) and ''ah'' (Asian handicap: line = home handicap, price_home / price_away), from football-data.co.uk. Bookmakers: B365, BW, IW, WH, VC; PS = Pinnacle 1X2 (to 8 Jan 2026, when the files dropped Pinnacle); P = Pinnacle O/U and AH; BFE = Betfair exchange (from 2024/25, before commission; excluded from Model Returns best price); Max and Avg are market summaries, not bookmakers. Read by the public Model Returns, market-efficiency and scorecard features. Before 27 Sep 2026 AH rows had the line in price_home and the prices in price_over/price_under (re-mapped; migration 20260927200000). Decimal odds include the margin; linked to matches, not fixtures.',
  purpose_reviewed_at = now()
where node_key = 'object:match_odds';

update public.meta_flow_nodes set
  purpose = purpose || ' Also history_snapshot_reconciles (failed): a team''s latest team_match_snapshot row differs from league_standings (split formats excluded).',
  purpose_reviewed_at = now()
where node_key = 'function:check_model_integrity()' and purpose not like '%history_snapshot_reconciles%';

update public.meta_flow_nodes set
  refresh_note = refresh_note || ' home_xg/away_xg: football-data.co.uk HxG/AxG, English divisions from 2026/27, mapped by import-daily.ts from 27 Sep 2026 (gaps backfilled from raw rows); NULL where the file has none.',
  purpose_reviewed_at = now()
where node_key = 'object:matches' and refresh_note not like '%HxG/AxG%';

update public.meta_flow_nodes set
  purpose = purpose || ' Betfair exchange prices (bookmaker ''BFE'', added 27 Sep 2026) are excluded: they are before commission, not a bookmaker price.',
  purpose_reviewed_at = now()
where node_key like 'function:get_betting_bets(%' and purpose not like '%BFE%';

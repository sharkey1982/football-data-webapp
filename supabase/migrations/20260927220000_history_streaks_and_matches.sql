-- ============================================================================
-- Historical analytics, Phase B foundations: streaks and league matches for
-- the Record Book (docs/methodology/history.md).
--
-- 1. history_streaks: every run of 3+ consecutive league matches of one kind
--    (won, unbeaten, winless, lost, scored, clean_sheet, no_goal) per club and
--    league. Runs continue across CONSECUTIVE seasons in the same league; a
--    season elsewhere ends them. ongoing = still running in the current
--    season; truncated_start = began at the club's first match of the
--    league's first season on file (so the real run may be longer).
-- 2. history_league_matches: one row per league match (home side's view of
--    team_match_snapshot) with total goals and margin, for match records.
-- 3. refresh_history_derived() refreshes history_streaks when any
--    league-season was rebuilt (or with p_force).
-- ============================================================================

create materialized view public.history_streaks as
with base as (
  select s.league_id, s.team_id, s.season_id, se.start_year, s.match_id, s.match_date, s.matches_played,
    s.result, s.goals_for, s.goals_against,
    se.start_year - dense_rank() over (partition by s.league_id, s.team_id order by se.start_year) as spell
  from public.team_match_snapshot s
  join public.seasons se using (season_id)
),
typed as (
  select b.*, k.streak_type,
    case k.streak_type
      when 'won' then b.result = 'W'
      when 'unbeaten' then b.result <> 'L'
      when 'winless' then b.result <> 'W'
      when 'lost' then b.result = 'L'
      when 'scored' then b.goals_for > 0
      when 'clean_sheet' then b.goals_against = 0
      when 'no_goal' then b.goals_for = 0
    end as ok
  from base b
  cross join (values ('won'), ('unbeaten'), ('winless'), ('lost'), ('scored'), ('clean_sheet'), ('no_goal')) k(streak_type)
),
islands as (
  select *,
    row_number() over (partition by league_id, team_id, spell, streak_type order by match_date, match_id)
      - row_number() over (partition by league_id, team_id, spell, streak_type, ok order by match_date, match_id) as grp
  from typed
),
runs as (
  select league_id, team_id, streak_type, count(*)::int as length,
    min(match_date) as start_date, max(match_date) as end_date,
    (array_agg(season_id order by match_date, match_id))[1] as start_season_id,
    (array_agg(season_id order by match_date desc, match_id desc))[1] as end_season_id,
    (array_agg(match_id order by match_date, match_id))[1] as start_match_id,
    (array_agg(match_id order by match_date desc, match_id desc))[1] as end_match_id,
    (array_agg(matches_played order by match_date, match_id))[1] as start_matches_played
  from islands
  where ok
  group by league_id, team_id, spell, streak_type, grp
  having count(*) >= 3
),
last_match as (
  select league_id, team_id, max(match_date) as last_date from public.team_match_snapshot group by 1, 2
),
league_edges as (
  select league_id,
    (array_agg(season_id order by start_year))[1] as first_season_id,
    (array_agg(season_id order by start_year desc))[1] as latest_season_id,
    (array_agg(is_final order by start_year desc))[1] as latest_is_final
  from public.league_season_summary
  group by league_id
)
select r.league_id, r.team_id, r.streak_type, r.length, r.start_date, r.end_date,
  r.start_season_id, r.end_season_id, r.start_match_id, r.end_match_id,
  (r.end_season_id = e.latest_season_id and not e.latest_is_final and r.end_date = lm.last_date) as ongoing,
  (r.start_season_id = e.first_season_id and r.start_matches_played = 1) as truncated_start
from runs r
join league_edges e using (league_id)
join last_match lm using (league_id, team_id);

create unique index history_streaks_pk on public.history_streaks (league_id, team_id, streak_type, start_match_id);
create index history_streaks_rank on public.history_streaks (league_id, streak_type, length desc);

create view public.history_league_matches with (security_invoker = true) as
select s.league_id, s.season_id, se.start_year, s.match_id, s.match_date,
  s.team_id as home_team_id, s.opponent_team_id as away_team_id,
  s.goals_for as home_goals, s.goals_against as away_goals,
  s.goals_for + s.goals_against as total_goals,
  abs(s.goals_for - s.goals_against) as margin
from public.team_match_snapshot s
join public.seasons se using (season_id)
where s.venue = 'H';

grant select on public.history_streaks, public.history_league_matches to anon, authenticated;

-- Refresh streaks with the rest of the layer, only when something changed.
do $$
declare
  v_def text;
  v_anchor text := 'refresh materialized view concurrently public.league_table_reliability;';
begin
  select pg_get_functiondef('public.refresh_history_derived(boolean)'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'refresh_history_derived anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor, v_anchor || E'\n  if v_seasons > 0 or p_force then\n    refresh materialized view concurrently public.history_streaks;\n  end if;');
end $$;

-- Guard the new public objects' grants like the other public views.
do $$
declare
  v_def text;
  v_anchor text := '''model_scorecard_matches''';
begin
  select pg_get_functiondef('public.check_model_integrity'::regproc) into v_def;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'check_model_integrity public-views anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor, v_anchor || ', ''history_streaks'', ''history_league_matches''');
end $$;

-- Catalogue.
select public.meta_refresh_flow();

update public.meta_flow_nodes set
  layer = 'model', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'Every run of 3+ consecutive league matches of one kind per club and league: streak_type won, unbeaten, winless, lost, scored, clean_sheet or no_goal; length, start/end date, season and match. Runs continue across consecutive seasons in the same league; a season in another division ends them. ongoing = still running in the current season; truncated_start = began at the club''s first match of the league''s first season on file, so the real run may be longer. From team_match_snapshot. Powers the Record Book (/football/records/:league).',
  refresh_note = 'Refreshed (concurrently) by refresh_history_derived() when any league-season was rebuilt, or with p_force.',
  purpose_reviewed_at = now()
where node_key = 'object:history_streaks';

update public.meta_flow_nodes set
  layer = 'model', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'One row per league match (home side''s row of team_match_snapshot): league, season, start_year, date, home and away team, goals, total_goals and margin. Security invoker view. Powers match records (biggest wins, highest-scoring games) in the Record Book.',
  refresh_note = 'View over team_match_snapshot; no state of its own.',
  purpose_reviewed_at = now()
where node_key = 'object:history_league_matches';

update public.meta_flow_nodes set
  purpose = 'Refreshes the historical data layer: rebuilds team_match_snapshot for league-seasons whose matches changed (row count or updated_at) or gained a deduction since the last build (all of them with p_force), then refreshes team_season_summary, league_season_summary, league_pace_benchmarks and league_table_reliability concurrently, and history_streaks when anything was rebuilt. Returns league-seasons rebuilt, rows and seconds.',
  purpose_reviewed_at = now()
where node_key = 'function:refresh_history_derived(p_force boolean)';

update public.meta_flow_nodes set purpose_reviewed_at = now()
where node_key = 'function:check_model_integrity()';

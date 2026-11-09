-- Live definition exported from the database (function snapshot_fpl_projections(p_season_id bigint, p_event integer, p_kind text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.snapshot_fpl_projections(p_season_id bigint, p_event integer, p_kind text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_deadline timestamptz; v_players int; v_fixtures int; v_state int; v_hfix int; v_hplay int; v_model text;
begin
  select deadline_time into v_deadline from public.fpl_gameweeks where season_id = p_season_id and fpl_event_id = p_event;
  if v_deadline is null then raise exception 'No gameweek % in season %', p_event, p_season_id; end if;

  insert into public.fpl_projection_fixture_snapshots (season_id, fpl_event_id, snapshot_kind, deadline_time, fixture_id,
    predicted_home_goals, predicted_away_goals, kickoff_date, kickoff_time, market_home_goals, market_away_goals)
  select p_season_id, p_event, p_kind, v_deadline, f.fixture_id, f.predicted_home_goals, f.predicted_away_goals, f.kickoff_date, f.kickoff_time,
         f.market_home_goals, f.market_away_goals
  from public.fpl_fixtures ff join public.fixtures f on f.fixture_id = ff.canonical_fixture_id
  where ff.season_id = p_season_id and ff.fpl_event_id = p_event
  on conflict do nothing;
  get diagnostics v_fixtures = row_count;

  insert into public.fpl_projection_snapshots (season_id, fpl_event_id, snapshot_kind, deadline_time, fixture_id, fpl_player_id,
    model_version, projection_generated_at, expected_minutes, start_probability, sub_appearance_probability, availability_probability,
    lineup_confidence, minutes_source, tactical_role, expected_goals, expected_assists, clean_sheet_probability, expected_saves,
    defensive_contribution_probability, expected_bonus, xpts_appearance, xpts_goals, xpts_assists, xpts_clean_sheet, xpts_saves,
    xpts_defensive_contribution, xpts_cards_own_goals, xpts_bonus, xpts_goals_conceded, xpts_penalties, expected_fpl_points)
  select p_season_id, p_event, p_kind, v_deadline, p.fixture_id, p.fpl_player_id, p.model_version, p.generated_at,
    p.expected_minutes, p.start_probability, p.sub_appearance_probability, p.availability_probability, p.lineup_confidence,
    p.minutes_source, p.tactical_role, p.expected_goals, p.expected_assists, p.clean_sheet_probability, p.expected_saves,
    p.defensive_contribution_probability, p.expected_bonus, p.xpts_appearance, p.xpts_goals, p.xpts_assists, p.xpts_clean_sheet,
    p.xpts_saves, p.xpts_defensive_contribution, p.xpts_cards_own_goals, p.xpts_bonus, p.xpts_goals_conceded, p.xpts_penalties,
    p.expected_fpl_points
  from public.fpl_player_projections p
  join public.fpl_fixtures ff on ff.canonical_fixture_id = p.fixture_id and ff.season_id = p_season_id and ff.fpl_event_id = p_event
  on conflict do nothing;
  get diagnostics v_players = row_count;

  insert into public.fpl_deadline_player_state (season_id, fpl_event_id, snapshot_kind, deadline_time, fpl_player_id, fpl_code,
    fpl_team_id, element_type, status, chance_of_playing_this_round, chance_of_playing_next_round, news, news_added,
    now_cost, selected_by_percent, form, ep_this, ep_next, transfers_in_event, transfers_out_event, total_points, minutes,
    source_updated_at, source_payload)
  select p_season_id, p_event, p_kind, v_deadline, fp.fpl_player_id, fp.fpl_code,
    fp.fpl_team_id, fp.element_type, fp.status, fp.chance_of_playing_this_round, fp.chance_of_playing_next_round, fp.news, fp.news_added,
    fp.now_cost, fp.selected_by_percent,
    public.safe_numeric(fp.source_payload->>'form'),
    public.safe_numeric(fp.source_payload->>'ep_this'),
    public.safe_numeric(fp.source_payload->>'ep_next'),
    public.safe_numeric(fp.source_payload->>'transfers_in_event')::bigint,
    public.safe_numeric(fp.source_payload->>'transfers_out_event')::bigint,
    fp.total_points, fp.minutes, fp.updated_at, fp.source_payload
  from public.fpl_players fp
  where fp.season_id = p_season_id
  on conflict do nothing;
  get diagnostics v_state = row_count;

  -- Next 10 gameweeks (12 Oct 2026): fixture goals and player projections.
  insert into public.fpl_deadline_fixture_horizon (season_id, fpl_event_id, snapshot_kind, fixture_id, fixture_event_id,
    home_team_id, away_team_id, market_home_goals, market_away_goals, predicted_home_goals, predicted_away_goals)
  select p_season_id, p_event, p_kind, f.fixture_id, ff.fpl_event_id, f.home_team_id, f.away_team_id,
         f.market_home_goals, f.market_away_goals, f.predicted_home_goals, f.predicted_away_goals
  from public.fpl_fixtures ff join public.fixtures f on f.fixture_id = ff.canonical_fixture_id
  where ff.season_id = p_season_id and ff.fpl_event_id between p_event and p_event + 9
  on conflict do nothing;
  get diagnostics v_hfix = row_count;

  select p.model_version into v_model from public.fpl_player_projections p
   where p.season_id = p_season_id order by p.generated_at desc limit 1;

  insert into public.fpl_deadline_player_horizon (season_id, fpl_event_id, snapshot_kind, fixture_id, fixture_event_id, fpl_player_id,
    model_version, expected_minutes, start_probability, expected_fpl_points, tactical_role, minutes_source)
  select p_season_id, p_event, p_kind, p.fixture_id, ff.fpl_event_id, p.fpl_player_id, p.model_version,
         p.expected_minutes, p.start_probability, p.expected_fpl_points, p.tactical_role, p.minutes_source
  from public.fpl_player_projections p
  join public.fpl_fixtures ff on ff.canonical_fixture_id = p.fixture_id and ff.season_id = p_season_id
  where p.season_id = p_season_id and p.model_version = v_model and coalesce(p.scenario_key, 'baseline') = 'baseline'
    and ff.fpl_event_id between p_event and p_event + 9
  on conflict do nothing;
  get diagnostics v_hplay = row_count;

  return jsonb_build_object('event', p_event, 'kind', p_kind, 'deadline', v_deadline, 'fixtures', v_fixtures,
    'player_rows', v_players, 'player_state_rows', v_state, 'horizon_fixtures', v_hfix, 'horizon_player_rows', v_hplay);
end;
$function$
;

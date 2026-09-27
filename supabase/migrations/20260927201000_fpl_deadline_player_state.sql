-- ============================================================================
-- Pre-deadline FPL player state (Modelling Programme, roadmap Q1).
--
-- fpl_projection_snapshots already freezes what FixtureShark's model said
-- before each deadline. This adds what FPL itself showed at that moment:
-- price, ownership, status, chance of playing, news and form, plus the raw
-- API payload. fpl_players and fpl_player_snapshots are overwritten (the
-- latter once a day), so without this there is no record of the state a
-- manager actually saw at the deadline -- the gold-standard training set the
-- programme needs.
--
-- Captured by snapshot_fpl_projections() in the same call as the projection
-- snapshot, so every snapshot kind ('pre_deadline', 'late', 'manual') gets
-- both. Before a 'pre_deadline' capture, snapshot_due_fpl_projections() now
-- refreshes FPL data first (private.refresh_fpl(), the same body the 6-hourly
-- cron runs), so the state is at most minutes old rather than up to 6 hours.
-- A failed refresh does not block the capture: source_updated_at records how
-- fresh each player's row was, and the failure is returned in the cron log.
--
-- Append-only (refuse_snapshot_changes trigger). Private: service_role reads
-- by default; no anon policy (raw FPL data, research use only).
-- ============================================================================

create table public.fpl_deadline_player_state (
  state_row_id bigint generated always as identity primary key,
  season_id bigint not null,
  fpl_event_id int not null,
  snapshot_kind text not null check (snapshot_kind in ('pre_deadline', 'late', 'manual')),
  snapshot_at timestamptz not null default now(),
  deadline_time timestamptz not null,
  fpl_player_id int not null,
  fpl_code bigint,
  fpl_team_id int,
  element_type int,
  status text,
  chance_of_playing_this_round int,
  chance_of_playing_next_round int,
  news text,
  news_added timestamptz,
  now_cost int,
  selected_by_percent numeric,
  form numeric,
  ep_this numeric,
  ep_next numeric,
  transfers_in_event bigint,
  transfers_out_event bigint,
  total_points int,
  minutes int,
  source_updated_at timestamptz,
  source_payload jsonb,
  unique (season_id, fpl_event_id, snapshot_kind, fpl_player_id)
);
create index fpl_deadline_player_state_player on public.fpl_deadline_player_state (fpl_code, season_id, fpl_event_id);

create trigger fpl_deadline_player_state_append_only before update or delete on public.fpl_deadline_player_state
  for each row execute function public.refuse_snapshot_changes();
alter table public.fpl_deadline_player_state enable row level security;

CREATE OR REPLACE FUNCTION public.snapshot_fpl_projections(p_season_id bigint, p_event integer, p_kind text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_deadline timestamptz; v_players int; v_fixtures int; v_state int;
begin
  select deadline_time into v_deadline from public.fpl_gameweeks where season_id = p_season_id and fpl_event_id = p_event;
  if v_deadline is null then raise exception 'No gameweek % in season %', p_event, p_season_id; end if;

  insert into public.fpl_projection_fixture_snapshots (season_id, fpl_event_id, snapshot_kind, deadline_time, fixture_id,
    predicted_home_goals, predicted_away_goals, kickoff_date, kickoff_time)
  select p_season_id, p_event, p_kind, v_deadline, f.fixture_id, f.predicted_home_goals, f.predicted_away_goals, f.kickoff_date, f.kickoff_time
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

  return jsonb_build_object('event', p_event, 'kind', p_kind, 'deadline', v_deadline, 'fixtures', v_fixtures,
    'player_rows', v_players, 'player_state_rows', v_state);
end;
$function$;

CREATE OR REPLACE FUNCTION public.snapshot_due_fpl_projections()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare g record; v_out jsonb := '[]'; v_refresh text;
begin
  for g in
    select gw.season_id, gw.fpl_event_id, gw.deadline_time,
      exists (select 1 from public.fpl_projection_snapshots s where s.season_id = gw.season_id and s.fpl_event_id = gw.fpl_event_id
              and s.snapshot_kind in ('pre_deadline','late')) already,
      (select min(kickoff_time) from public.fpl_fixtures ff where ff.season_id = gw.season_id and ff.fpl_event_id = gw.fpl_event_id) first_kickoff
    from public.fpl_gameweeks gw
    where gw.deadline_time between now() - interval '2 days' and now() + interval '60 minutes'
  loop
    continue when g.already;
    if now() <= g.deadline_time then
      -- Freshen FPL state first; never let a failed refresh block the capture.
      begin
        perform private.refresh_fpl();
        v_refresh := 'ok';
      exception when others then
        v_refresh := 'failed: ' || sqlerrm;
      end;
      v_out := v_out || (public.snapshot_fpl_projections(g.season_id, g.fpl_event_id, 'pre_deadline')
                         || jsonb_build_object('fpl_refresh', v_refresh));
    elsif g.first_kickoff is null or now() < g.first_kickoff then
      v_out := v_out || public.snapshot_fpl_projections(g.season_id, g.fpl_event_id, 'late');
    end if;
  end loop;
  return v_out;
end;
$function$;

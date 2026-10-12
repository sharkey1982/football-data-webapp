-- FPL gameweek preview and reflection: storage (12 Oct 2026).
--
-- Design: project doc claude/fpl-gameweek-preview-reflection-design-2026-10-12.md
-- (approved by Chris 12 Oct). Reflection on Tuesday, preview on Thursday.
--
-- 1. fpl_gameweek_reports: one row per version of a gameweek's preview or
--    reflection, written by scripts/fpl_gameweek_report.py. Drafts can be
--    replaced; a published version is permanent (corrections are new
--    versions). Public read of published rows only.
-- 2. fpl_gameweek_reports_latest: the newest published version of each.
-- 3. The deadline snapshot also records the next 10 gameweeks (fixture goals
--    and player minutes/points), so a reflection can show how modelled goals
--    and player assumptions moved since the deadline. It also records the
--    gameweek's market goals, which it lacked (the projections use them
--    ahead of Dixon-Coles).
-- Safe to re-run.

-- 1. Reports ------------------------------------------------------------------

create table if not exists public.fpl_gameweek_reports (
  report_id bigint generated always as identity primary key,
  season_id bigint not null references public.seasons (season_id),
  season_label text not null,
  fpl_event_id integer not null,
  kind text not null check (kind in ('preview', 'reflection')),
  version integer not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  frozen boolean not null default false,
  generated_at timestamptz not null default now(),
  published_at timestamptz,
  title text not null,
  summary text,
  payload jsonb not null,
  reddit_md text,
  x_thread jsonb,
  code_ref text,
  unique (season_id, fpl_event_id, kind, version)
);
comment on table public.fpl_gameweek_reports is
  'FPL gameweek previews and reflections, one row per version (scripts/fpl_gameweek_report.py). Drafts may be replaced; published rows are permanent and corrections are new versions. A frozen preview is the deadline record. Pages: /fpl/gameweek/<season>/<gw>/<kind>.';

create or replace function private.fpl_gameweek_reports_guard()
 returns trigger
 language plpgsql
as $$
begin
  if old.status = 'published' then
    raise exception 'fpl_gameweek_reports: published report % (GW% %, v%) cannot be changed or deleted; add a new version',
      old.report_id, old.fpl_event_id, old.kind, old.version;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists fpl_gameweek_reports_guard on public.fpl_gameweek_reports;
create trigger fpl_gameweek_reports_guard
  before update or delete on public.fpl_gameweek_reports
  for each row execute function private.fpl_gameweek_reports_guard();

alter table public.fpl_gameweek_reports enable row level security;
drop policy if exists fpl_gameweek_reports_public_read on public.fpl_gameweek_reports;
create policy fpl_gameweek_reports_public_read on public.fpl_gameweek_reports
  for select to anon, authenticated using (status = 'published');
grant select on public.fpl_gameweek_reports to anon, authenticated;

-- 2. Latest published version ------------------------------------------------------

create or replace view public.fpl_gameweek_reports_latest
with (security_invoker = true) as
select distinct on (season_id, fpl_event_id, kind)
       report_id, season_id, season_label, fpl_event_id, kind, version, frozen, generated_at, published_at,
       title, summary, payload, reddit_md, x_thread
  from public.fpl_gameweek_reports
 where status = 'published'
 order by season_id, fpl_event_id, kind, version desc;
grant select on public.fpl_gameweek_reports_latest to anon, authenticated;

-- 3. Deadline horizon ---------------------------------------------------------------

alter table public.fpl_projection_fixture_snapshots
  add column if not exists market_home_goals numeric,
  add column if not exists market_away_goals numeric;

create table if not exists public.fpl_deadline_fixture_horizon (
  season_id bigint not null,
  fpl_event_id integer not null,
  snapshot_kind text not null,
  snapshot_at timestamptz not null default now(),
  fixture_id bigint not null,
  fixture_event_id integer,
  home_team_id bigint,
  away_team_id bigint,
  market_home_goals numeric,
  market_away_goals numeric,
  predicted_home_goals numeric,
  predicted_away_goals numeric,
  primary key (season_id, fpl_event_id, snapshot_kind, fixture_id)
);
comment on table public.fpl_deadline_fixture_horizon is
  'At each FPL deadline snapshot: expected goals (market and Dixon-Coles) for every fixture in that gameweek and the next 9. Lets the gameweek reflection show how modelled goals moved since the deadline.';

create table if not exists public.fpl_deadline_player_horizon (
  season_id bigint not null,
  fpl_event_id integer not null,
  snapshot_kind text not null,
  snapshot_at timestamptz not null default now(),
  fixture_id bigint not null,
  fixture_event_id integer,
  fpl_player_id bigint not null,
  model_version text,
  expected_minutes numeric,
  start_probability numeric,
  expected_fpl_points numeric,
  tactical_role text,
  minutes_source text,
  primary key (season_id, fpl_event_id, snapshot_kind, fixture_id, fpl_player_id)
);
comment on table public.fpl_deadline_player_horizon is
  'At each FPL deadline snapshot: every player''s baseline projection (latest model version) for the gameweek and the next 9: expected minutes, start chance, expected points, role. For the gameweek reflection.';

alter table public.fpl_deadline_fixture_horizon enable row level security;
alter table public.fpl_deadline_player_horizon enable row level security;
-- Read by the report generator (service role) only.

create or replace function public.snapshot_fpl_projections(p_season_id bigint, p_event integer, p_kind text DEFAULT 'manual'::text)
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
$function$;

-- 4. Catalogue -----------------------------------------------------------------------

select public.meta_refresh_flow();

update public.meta_flow_nodes set layer = 'fantasy', status = 'current', is_public = true, ai_relevant = false,
  purpose = 'FPL gameweek previews (Thursday) and reflections (Tuesday), one row per version with the page payload and Reddit/X text. Published rows are permanent.',
  refresh_note = 'scripts/fpl_gameweek_report.py, run by the FPL projections pipeline and on demand (workflow gameweek-report).', purpose_reviewed_at = now()
where node_key = 'object:fpl_gameweek_reports';

update public.meta_flow_nodes set layer = 'fantasy', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Expected goals (market and Dixon-Coles) for the next 10 gameweeks'' fixtures, saved at each FPL deadline.',
  refresh_note = 'snapshot_fpl_projections(), from 12 Oct 2026 (first: GW7).', purpose_reviewed_at = now()
where node_key = 'object:fpl_deadline_fixture_horizon';

update public.meta_flow_nodes set layer = 'fantasy', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Every player''s baseline projection for the next 10 gameweeks (minutes, start chance, points, role), saved at each FPL deadline.',
  refresh_note = 'snapshot_fpl_projections(), from 12 Oct 2026 (first: GW7).', purpose_reviewed_at = now()
where node_key = 'object:fpl_deadline_player_horizon';

update public.meta_flow_nodes set purpose_reviewed_at = now()
where node_key = 'function:snapshot_fpl_projections(p_season_id bigint, p_event integer, p_kind text)';

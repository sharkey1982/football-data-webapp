-- ============================================================================
-- FixtureShark social publishing (X, @FixtureSharkHQ): Phases 1-3 schema.
-- Design and runbook: docs/social-publishing.md
--
-- What this creates
--   social_settings            one row: kill switch (ON by default), live gate
--                              (OFF), limits, budget, the one allowed account
--   social_post_candidates     every generated post, its source data, model
--                              version, snapshot time, validation, approval,
--                              publication status and X post id
--   social_publish_attempts    every dry run and live attempt (spend is
--                              counted from here)
--   social_audit_log           append-only record of every action
--   social_detector_runs       every detector run and every check it made,
--                              including the ones that rejected a candidate
--   social_fixture_forecast_obs  history of team goal forecasts, so changes
--                              are measured like for like
--   social_x_connection        which X account is connected (no secrets)
--   private.social_oauth_states  PKCE verifiers, single use, 10 minutes
--   tokens                     Supabase Vault secret 'x_oauth_fixturesharkhq'
--
-- What this deliberately does NOT do
--   - no job publishes anything. The only scheduled job here is the
--     detector, which writes candidates. Live posts happen only when an admin
--     presses Publish on one approved candidate, with the kill switch off and
--     live publishing enabled, both of which Chris sets by hand.
--   - auto_publish_enabled cannot be switched on (social_update_settings
--     refuses it) until a Phase 4 migration changes that.
--   - nothing existing is altered: every other table and job is only read.
-- ============================================================================

-- ---------------------------------------------------------------- settings
create table if not exists public.social_settings (
  id boolean primary key default true check (id),
  kill_switch boolean not null default true,
  live_enabled boolean not null default false,
  auto_publish_enabled boolean not null default false,
  detector_enabled boolean not null default true,
  allowed_x_username text not null default 'FixtureSharkHQ',
  allowed_x_user_id text,
  max_posts_per_day integer not null default 3 check (max_posts_per_day between 0 and 20),
  max_posts_per_month integer not null default 40 check (max_posts_per_month between 0 and 500),
  min_minutes_between_posts integer not null default 60 check (min_minutes_between_posts >= 0),
  monthly_budget_usd numeric(8,3) not null default 2.000 check (monthly_budget_usd >= 0),
  cost_per_post_usd numeric(8,4) not null default 0.0150,
  cost_per_post_with_url_usd numeric(8,4) not null default 0.2000,
  allow_urls boolean not null default false,
  max_live_attempts integer not null default 2 check (max_live_attempts between 1 and 5),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on table public.social_settings is
  'Social publishing controls (one row). kill_switch true = nothing can be posted live. live_enabled and auto_publish_enabled are Chris''s explicit switches; auto publish is refused until Phase 4. Admin-only.';
insert into public.social_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------- candidates
create table if not exists public.social_post_candidates (
  candidate_id bigint generated always as identity primary key,
  post_type text not null check (post_type in ('fpl_captaincy', 'team_xg_change', 'prediction_accuracy', 'historical_insight')),
  sport text not null default 'football',
  text text not null,
  generated_text text not null,
  source_data jsonb not null,
  model_version text,
  snapshot_at timestamptz not null,
  dedupe_key text not null,
  expires_at timestamptz not null,
  validation_status text not null check (validation_status in ('passed', 'failed', 'stale')),
  validation_errors jsonb not null default '[]',
  validated_at timestamptz not null default now(),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected', 'superseded')),
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  scheduled_for timestamptz,
  publication_status text not null default 'unpublished'
    check (publication_status in ('unpublished', 'publishing', 'published', 'failed', 'needs_check')),
  x_post_id text unique,
  published_at timestamptz,
  publish_attempts integer not null default 0,
  last_error text,
  detector_run_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.social_post_candidates is
  'Candidate X posts from the social detector (docs/social-publishing.md). Text is generated from source_data; an edit may reword but may not add numbers not in generated_text. Admin-only; changed only through social_* functions.';
create unique index if not exists social_post_candidates_dedupe on public.social_post_candidates (dedupe_key);
-- The same words can never be live twice.
create unique index if not exists social_post_candidates_text_once on public.social_post_candidates
  (md5(lower(regexp_replace(btrim(text), '\s+', ' ', 'g'))))
  where publication_status in ('publishing', 'published', 'needs_check');
create index if not exists social_post_candidates_status on public.social_post_candidates (approval_status, publication_status, created_at desc);

-- ---------------------------------------------------------------- attempts
create table if not exists public.social_publish_attempts (
  attempt_id bigint generated always as identity primary key,
  candidate_id bigint not null references public.social_post_candidates (candidate_id),
  mode text not null check (mode in ('dry_run', 'live')),
  requested_by uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text check (outcome in ('dry_run_ok', 'blocked', 'posted', 'failed', 'unknown')),
  blocked_reasons jsonb not null default '[]',
  request_text text,
  has_url boolean not null default false,
  estimated_cost_usd numeric(8,4) not null default 0,
  http_status integer,
  x_post_id text,
  error text
);
comment on table public.social_publish_attempts is
  'Every dry run and live publish attempt. outcome null = live call in flight. Live spend and rate limits are counted from rows with outcome posted, unknown or null. Admin-only.';
create index if not exists social_publish_attempts_started on public.social_publish_attempts (mode, started_at desc);

-- ---------------------------------------------------------------- audit
create table if not exists public.social_audit_log (
  audit_id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  candidate_id bigint,
  detail jsonb not null default '{}'
);
comment on table public.social_audit_log is 'Append-only log of every social publishing action (no updates or deletes). Admin-only.';

create or replace function private.social_audit_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'social_audit_log is append-only';
end;
$$;
drop trigger if exists social_audit_log_append_only on public.social_audit_log;
create trigger social_audit_log_append_only before update or delete on public.social_audit_log
  for each row execute function private.social_audit_append_only();

-- ---------------------------------------------------------------- detector runs
create table if not exists public.social_detector_runs (
  run_id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  triggered_by text not null default 'schedule',
  results jsonb not null default '{}',
  candidates_created integer not null default 0,
  error text
);
comment on table public.social_detector_runs is 'One row per social detector run: per detector, whether it created a candidate, found nothing material, or rejected the data, with every check. Admin-only.';

-- ---------------------------------------------------------------- forecast history
create table if not exists public.social_fixture_forecast_obs (
  obs_id bigint generated always as identity primary key,
  fixture_id bigint not null,
  method text not null check (method in ('market', 'dc')),
  model_version text not null,
  kickoff_date date,
  home_team_id bigint not null,
  away_team_id bigint not null,
  home_goals numeric(6,4) not null,
  away_goals numeric(6,4) not null,
  source_at timestamptz,
  observed_at timestamptz not null default now()
);
comment on table public.social_fixture_forecast_obs is
  'Team goal forecasts for upcoming Premier League fixtures as the social detector saw them, a row only when the value changes. fixtures holds only the latest value, so this is what makes a before/after comparison possible. Admin-only.';
create index if not exists social_fixture_forecast_obs_fx on public.social_fixture_forecast_obs (fixture_id, method, observed_at);

-- ---------------------------------------------------------------- X connection (no secrets)
create table if not exists public.social_x_connection (
  id boolean primary key default true check (id),
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'error')),
  x_user_id text,
  x_username text,
  scopes text,
  connected_at timestamptz,
  connected_by uuid,
  access_expires_at timestamptz,
  last_refreshed_at timestamptz,
  token_version integer not null default 0,
  vault_secret_id uuid,
  last_error text,
  updated_at timestamptz not null default now()
);
comment on table public.social_x_connection is 'Which X account is authorised for publishing. Tokens are never here: they are in Supabase Vault (vault_secret_id). Admin-only.';
insert into public.social_x_connection (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------- OAuth state (private)
create table if not exists private.social_oauth_states (
  state_hash text primary key,
  code_verifier text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table private.social_oauth_states enable row level security;
revoke all on private.social_oauth_states from public, anon, authenticated;

-- ---------------------------------------------------------------- RLS: admins read, nobody writes directly
do $$
declare t text;
begin
  foreach t in array array['social_settings', 'social_post_candidates', 'social_publish_attempts', 'social_audit_log',
                           'social_detector_runs', 'social_fixture_forecast_obs', 'social_x_connection'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_admin_read', t);
  end loop;
end $$;

-- ============================================================================
-- Helpers
-- ============================================================================
create or replace function private.social_check(p_name text, p_ok boolean, p_detail jsonb default null)
returns jsonb language sql immutable as $$
  select jsonb_build_object('check', p_name, 'ok', coalesce(p_ok, false)) || coalesce(jsonb_build_object('detail', p_detail), '{}');
$$;

create or replace function private.social_audit(p_action text, p_candidate_id bigint, p_actor uuid, p_detail jsonb default '{}')
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.social_audit_log (action, candidate_id, actor, detail) values (p_action, p_candidate_id, p_actor, coalesce(p_detail, '{}'));
$$;

-- Numbers in a text ("£14.5m" -> 14.5, "GW7" -> 7).
create or replace function public.social_numbers(p_text text)
returns text[] language sql immutable as $$
  select coalesce(array_agg(m[1]), '{}') from regexp_matches(coalesce(p_text, ''), '([0-9]+(?:\.[0-9]+)?)', 'g') m;
$$;

-- Does the text contain a link (X charges more for posts with a URL)?
create or replace function public.social_has_url(p_text text)
returns boolean language sql immutable as $$
  select coalesce(p_text, '') ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|co\.uk|uk|net|org|io|app|ly|me|tv)\M)';
$$;

-- X's weighted length: URLs count 23, most Latin text counts 1 per
-- character, everything else (emoji, CJK) counts 2. Limit 280.
create or replace function public.social_weighted_length(p_text text)
returns integer language sql immutable as $$
  with t as (select regexp_replace(coalesce(p_text, ''), 'https?://[^\s]+', repeat('x', 23), 'g') s)
  select char_length(s) + char_length(regexp_replace(s, '[\u0001-\u10FF\u2000-\u200D\u2010-\u201F\u2032-\u2037]', '', 'g'))
    from t;
$$;

-- Format helpers used by the templates.
create or replace function private.social_fmt(p numeric, p_dp integer default 1)
returns text language sql immutable as $$
  select to_char(round(p, p_dp), 'FM9999990' || case when p_dp > 0 then '.' || repeat('0', p_dp) else '' end);
$$;

create or replace function private.social_team_name(p_team_id bigint)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(display_name, canonical_name) from public.teams where team_id = p_team_id;
$$;

-- ============================================================================
-- Captaincy ranking (shared by the detector and by revalidation)
-- ============================================================================
-- Top n available players by projected FPL points summed over the gameweek's
-- fixtures (a double gameweek counts both), from one model version.
create or replace function private.social_captaincy_top(p_season bigint, p_gw integer, p_model text, p_n integer default 5)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(r order by r.rank), '[]') from (
    select row_number() over (order by sum(p.expected_fpl_points) desc, p.fpl_player_id) rank,
           p.fpl_player_id, pl.web_name, ft.short_name team_short, pl.canonical_team_id team_id,
           pl.now_cost, round(sum(p.expected_fpl_points), 2) xpts, count(*) fixtures,
           min(p.generated_at) generated_from, max(p.generated_at) generated_to
      from public.fpl_player_projections p
      join public.fpl_fixtures ff on ff.season_id = p.season_id and ff.canonical_fixture_id = p.fixture_id
      join public.fpl_players pl on pl.season_id = p.season_id and pl.fpl_player_id = p.fpl_player_id
      join public.fpl_teams ft on ft.season_id = pl.season_id and ft.fpl_team_id = pl.fpl_team_id
     where p.season_id = p_season and ff.fpl_event_id = p_gw and p.model_version = p_model
       and coalesce(p.scenario_key, 'baseline') = 'baseline'
       and pl.status = 'a' and pl.now_cost > 0
     group by p.fpl_player_id, pl.web_name, ft.short_name, pl.canonical_team_id, pl.now_cost
     order by sum(p.expected_fpl_points) desc, p.fpl_player_id
     limit p_n) r;
$$;

-- ============================================================================
-- Detector 1: weekly FPL captaincy rankings
-- ============================================================================
create or replace function private.social_detect_captaincy(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_gw integer; v_deadline timestamptz; v_mv text;
  v_checks jsonb := '[]'; v_ok boolean;
  v_n integer; v_m integer; v_ts timestamptz; v_bad jsonb; v_top jsonb;
  v_key text; v_text text; v_line text; v_id bigint; r jsonb;
begin
  select fpl_event_id, deadline_time into v_gw, v_deadline
    from public.fpl_gameweeks where season_id = v_season and deadline_time > now() order by deadline_time limit 1;
  if v_gw is null then
    return jsonb_build_object('status', 'none', 'reason', 'no upcoming FPL deadline');
  end if;
  if v_deadline > now() + interval '72 hours' or v_deadline < now() + interval '3 hours' then
    return jsonb_build_object('status', 'none', 'reason', format('GW%s deadline %s is outside the 72h-3h window', v_gw, v_deadline));
  end if;

  select model_version into v_mv from public.fpl_player_projections where season_id = v_season order by generated_at desc limit 1;

  -- Fixture horizon and team mapping: every fixture in the gameweek maps to a FixtureShark fixture.
  select count(*), count(*) filter (where canonical_fixture_id is null) into v_n, v_m
    from public.fpl_fixtures where season_id = v_season and fpl_event_id = v_gw;
  v_checks := v_checks || private.social_check('gameweek fixtures mapped', v_n > 0 and v_m = 0,
                                               jsonb_build_object('gw', v_gw, 'fixtures', v_n, 'unmapped', v_m));

  -- Every fixture has projections from the latest model version, one row per player per fixture.
  select count(distinct p.fixture_id), count(*) - count(distinct (p.fixture_id, p.fpl_player_id)), min(p.generated_at)
    into v_m, v_n, v_ts
    from public.fpl_player_projections p
    join public.fpl_fixtures ff on ff.season_id = p.season_id and ff.canonical_fixture_id = p.fixture_id
   where p.season_id = v_season and ff.fpl_event_id = v_gw and p.model_version = v_mv
     and coalesce(p.scenario_key, 'baseline') = 'baseline';
  v_checks := v_checks || private.social_check('projections cover every fixture',
      v_m = (select count(*) from public.fpl_fixtures where season_id = v_season and fpl_event_id = v_gw),
      jsonb_build_object('model_version', v_mv, 'fixtures_projected', v_m));
  v_checks := v_checks || private.social_check('one projection per player per fixture', v_n = 0, jsonb_build_object('duplicates', v_n));
  v_checks := v_checks || private.social_check('projections fresh (< 30h)', v_ts >= now() - interval '30 hours',
                                               jsonb_build_object('oldest_generated_at', v_ts));

  -- FPL prices and statuses fresh.
  select max(completed_at) into v_ts from public.fpl_ingestion_runs where status = 'success';
  v_checks := v_checks || private.social_check('FPL data refreshed (< 12h)', v_ts >= now() - interval '12 hours',
                                               jsonb_build_object('last_success', v_ts));

  -- Latest projection pipeline run did not fail.
  select status into r from (select to_jsonb(status) status from public.pipeline_runs
                               where job_name = 'refresh_fpl_projections' and status in ('success', 'failed')
                               order by started_at desc limit 1) x;
  v_checks := v_checks || private.social_check('last projection run succeeded', r = to_jsonb('success'::text),
                                               jsonb_build_object('status', r));

  -- Team mapping: FPL team -> FixtureShark team agrees for every player.
  select count(*) into v_n from public.fpl_players pl join public.fpl_teams ft on ft.season_id = pl.season_id and ft.fpl_team_id = pl.fpl_team_id
   where pl.season_id = v_season and ft.canonical_team_id is distinct from pl.canonical_team_id;
  v_checks := v_checks || private.social_check('player team mapping consistent', v_n = 0, jsonb_build_object('mismatched_players', v_n));

  -- Reconcile: players' expected goals add up to the team forecast the projection used, per team per fixture.
  with tp as (
    select p.fixture_id, pl.canonical_team_id team_id, sum(p.expected_goals) player_xg
      from public.fpl_player_projections p
      join public.fpl_fixtures ff on ff.season_id = p.season_id and ff.canonical_fixture_id = p.fixture_id
      join public.fpl_players pl on pl.season_id = p.season_id and pl.fpl_player_id = p.fpl_player_id
     where p.season_id = v_season and ff.fpl_event_id = v_gw and p.model_version = v_mv
       and coalesce(p.scenario_key, 'baseline') = 'baseline'
     group by 1, 2),
  tf as (
    select tp.*, case when tp.team_id = f.home_team_id then coalesce(f.market_home_goals, f.predicted_home_goals)
                      when tp.team_id = f.away_team_id then coalesce(f.market_away_goals, f.predicted_away_goals) end team_goals,
           count(*) over (partition by tp.fixture_id) teams_in_fixture
      from tp join public.fixtures f on f.fixture_id = tp.fixture_id)
  select coalesce(jsonb_agg(jsonb_build_object('fixture_id', fixture_id, 'team_id', team_id, 'players_xg', round(player_xg, 3),
                                               'team_goals', round(team_goals::numeric, 3), 'teams_in_fixture', teams_in_fixture)), '[]')
    into v_bad from tf
   where team_goals is null or teams_in_fixture <> 2 or abs(player_xg - team_goals::numeric) > 0.05;
  v_checks := v_checks || private.social_check('player xG reconciles with team forecast (within 0.05)', jsonb_array_length(v_bad) = 0,
                                               jsonb_build_object('mismatches', v_bad));

  v_top := private.social_captaincy_top(v_season, v_gw, v_mv, 5);
  v_checks := v_checks || private.social_check('five available players ranked', jsonb_array_length(v_top) = 5, null);

  -- Each ranked player's fixtures in this gameweek include his team.
  select count(*) into v_n
    from jsonb_array_elements(v_top) t
    join public.fpl_player_projections p on p.season_id = v_season and p.fpl_player_id = (t->>'fpl_player_id')::int and p.model_version = v_mv
    join public.fpl_fixtures ff on ff.season_id = p.season_id and ff.canonical_fixture_id = p.fixture_id and ff.fpl_event_id = v_gw
    join public.fixtures f on f.fixture_id = p.fixture_id
   where (t->>'team_id')::bigint not in (f.home_team_id, f.away_team_id);
  v_checks := v_checks || private.social_check('ranked players play in their projected fixtures', v_n = 0, jsonb_build_object('wrong_fixture_rows', v_n));

  select bool_and((c->>'ok')::boolean) into v_ok from jsonb_array_elements(v_checks) c;
  if not v_ok then
    return jsonb_build_object('status', 'rejected', 'gw', v_gw, 'checks', v_checks);
  end if;

  v_key := format('fpl_captaincy:%s:%s:%s:%s', v_season, v_gw, v_mv,
                  (select string_agg(t->>'fpl_player_id', '-' order by (t->>'rank')::int) from jsonb_array_elements(v_top) t where (t->>'rank')::int <= 3));
  if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
    return jsonb_build_object('status', 'none', 'reason', 'top three unchanged since the last candidate', 'gw', v_gw);
  end if;

  v_text := format('FPL GW%s captaincy: FixtureShark projected points', v_gw);
  for r in select * from jsonb_array_elements(v_top) loop
    v_line := format('%s. %s (%s, £%sm) %s%s', r->>'rank', r->>'web_name', r->>'team_short',
                     private.social_fmt((r->>'now_cost')::numeric / 10, 1), private.social_fmt((r->>'xpts')::numeric, 1),
                     case when (r->>'fixtures')::int > 1 then format(' (%s fixtures)', r->>'fixtures') else '' end);
    v_text := v_text || E'\n' || v_line;
  end loop;
  v_text := v_text || E'\n' || format('Model: %s', v_mv);

  -- A newer ranking replaces older pending ones for the same gameweek.
  update public.social_post_candidates set approval_status = 'superseded', updated_at = now()
   where post_type = 'fpl_captaincy' and approval_status = 'pending'
     and (source_data->>'season_id')::bigint = v_season and (source_data->>'gw')::int = v_gw;

  insert into public.social_post_candidates (post_type, text, generated_text, source_data, model_version, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('fpl_captaincy', v_text, v_text,
          jsonb_build_object('season_id', v_season, 'gw', v_gw, 'deadline', v_deadline, 'model_version', v_mv,
                             'players', v_top, 'checks', v_checks),
          v_mv, (select max((t->>'generated_to')::timestamptz) from jsonb_array_elements(v_top) t), v_key,
          v_deadline, 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'fpl_captaincy', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'gw', v_gw, 'checks', v_checks);
end;
$$;

-- ============================================================================
-- Detector 2: material changes in team goal forecasts
-- ============================================================================
-- Like for like only: same fixture (so the same horizon), same method
-- (market-rated goals, which drive the FPL projections), same model version,
-- same kick-off date, and no logged model change in between. Material =
-- at least 0.30 goals AND at least 20% against a forecast 2-8 days old.
create or replace function private.social_detect_xg_change(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_gw integer; v_inserted integer; v_out jsonb := '[]'; v_created integer := 0;
  c record; v_checks jsonb; v_ok boolean; v_n numeric; v_mv text; v_status text;
  v_text text; v_key text; v_id bigint; v_home text; v_away text;
begin
  select fpl_event_id into v_gw from public.fpl_gameweeks where season_id = v_season and deadline_time > now() order by deadline_time limit 1;
  if v_gw is null then return jsonb_build_object('status', 'none', 'reason', 'no upcoming FPL deadline'); end if;

  -- 1. Record what the forecasts are now (a row only when a value changed).
  with cur as (
    select f.fixture_id, f.kickoff_date, f.home_team_id, f.away_team_id, x.method, x.mv, x.hg, x.ag, x.at
      from public.fpl_fixtures ff
      join public.fixtures f on f.fixture_id = ff.canonical_fixture_id
      cross join lateral (values ('market', 'market_ratings', f.market_home_goals, f.market_away_goals, f.market_rated_at),
                                 ('dc', coalesce(f.prediction_model_version, 'unknown'), f.predicted_home_goals, f.predicted_away_goals, f.predicted_at))
                         x(method, mv, hg, ag, at)
     where ff.season_id = v_season and ff.fpl_event_id between v_gw and v_gw + 2 and x.hg is not null and x.ag is not null)
  insert into public.social_fixture_forecast_obs (fixture_id, method, model_version, kickoff_date, home_team_id, away_team_id, home_goals, away_goals, source_at)
  select cur.fixture_id, cur.method, cur.mv, cur.kickoff_date, cur.home_team_id, cur.away_team_id, cur.hg, cur.ag, cur.at
    from cur
   where not exists (
     select 1 from (select o.* from public.social_fixture_forecast_obs o
                     where o.fixture_id = cur.fixture_id and o.method = cur.method order by o.observed_at desc limit 1) l
      where l.model_version = cur.mv and l.kickoff_date is not distinct from cur.kickoff_date
        and abs(l.home_goals - cur.hg::numeric) < 0.005 and abs(l.away_goals - cur.ag::numeric) < 0.005);
  get diagnostics v_inserted = row_count;

  select status into v_status from public.pipeline_runs where job_name = 'refresh_market_goals' and status in ('success', 'failed')
   order by started_at desc limit 1;
  select model_version into v_mv from public.fpl_player_projections where season_id = v_season order by generated_at desc limit 1;

  -- 2. Compare each fixture with its forecast from 2-8 days ago.
  for c in
    with cur as (
      select f.fixture_id, ff.fpl_event_id gw, ff.kickoff_time, f.kickoff_date, f.home_team_id, f.away_team_id,
             f.market_home_goals::numeric hg, f.market_away_goals::numeric ag, f.market_rated_at
        from public.fpl_fixtures ff join public.fixtures f on f.fixture_id = ff.canonical_fixture_id
       where ff.season_id = v_season and ff.fpl_event_id between v_gw and v_gw + 2
         and f.market_home_goals is not null and ff.kickoff_time > now() + interval '6 hours'),
    base as (
      select distinct on (o.fixture_id) o.*
        from public.social_fixture_forecast_obs o
       where o.method = 'market' and o.observed_at between now() - interval '8 days' and now() - interval '48 hours'
       order by o.fixture_id, o.observed_at)
    select cur.*, base.home_goals bh, base.away_goals ba, base.observed_at base_at, base.model_version base_mv,
           base.kickoff_date base_kickoff_date,
           greatest(abs(cur.hg - base.home_goals), abs(cur.ag - base.away_goals)) max_delta
      from cur join base on base.fixture_id = cur.fixture_id
     where (abs(cur.hg - base.home_goals) >= 0.30 and abs(cur.hg - base.home_goals) >= 0.20 * base.home_goals)
        or (abs(cur.ag - base.away_goals) >= 0.30 and abs(cur.ag - base.away_goals) >= 0.20 * base.away_goals)
     order by max_delta desc
  loop
    exit when v_created >= 2;
    v_checks := '[]';
    v_checks := v_checks || private.social_check('same method and model version', c.base_mv = 'market_ratings', jsonb_build_object('base', c.base_mv));
    v_checks := v_checks || private.social_check('same kick-off date (same horizon)', c.base_kickoff_date is not distinct from c.kickoff_date,
                                                 jsonb_build_object('then', c.base_kickoff_date, 'now', c.kickoff_date));
    v_checks := v_checks || private.social_check('no model change logged since the earlier forecast',
        not exists (select 1 from public.model_change_log where changed_at >= c.base_at::date), null);
    v_checks := v_checks || private.social_check('forecast fresh (< 36h)', c.market_rated_at >= now() - interval '36 hours',
                                                 jsonb_build_object('market_rated_at', c.market_rated_at));
    v_checks := v_checks || private.social_check('last market goals run succeeded', v_status = 'success', jsonb_build_object('status', v_status));
    -- Player projections agree with the new team forecast (both teams).
    select max(abs(s.player_xg - case when s.team_id = c.home_team_id then c.hg else c.ag end)) into v_n
      from (select pl.canonical_team_id team_id, sum(p.expected_goals) player_xg
              from public.fpl_player_projections p
              join public.fpl_players pl on pl.season_id = p.season_id and pl.fpl_player_id = p.fpl_player_id
             where p.season_id = v_season and p.fixture_id = c.fixture_id and p.model_version = v_mv
               and coalesce(p.scenario_key, 'baseline') = 'baseline'
             group by 1) s
     where s.team_id in (c.home_team_id, c.away_team_id);
    v_checks := v_checks || private.social_check('player projections reconcile with new forecast (within 0.05)', v_n is not null and v_n <= 0.05,
                                                 jsonb_build_object('max_gap', round(v_n, 3), 'model_version', v_mv));
    v_checks := v_checks || private.social_check('no post about this fixture in the last 7 days',
        not exists (select 1 from public.social_post_candidates where post_type = 'team_xg_change'
                     and (source_data->>'fixture_id')::bigint = c.fixture_id and created_at > now() - interval '7 days'), null);
    select bool_and((x->>'ok')::boolean) into v_ok from jsonb_array_elements(v_checks) x;

    if not v_ok then
      v_out := v_out || jsonb_build_object('fixture_id', c.fixture_id, 'status', 'rejected', 'checks', v_checks);
      continue;
    end if;

    v_home := private.social_team_name(c.home_team_id);
    v_away := private.social_team_name(c.away_team_id);
    v_key := format('team_xg_change:%s:%s:%s', c.fixture_id, private.social_fmt(c.hg, 2), private.social_fmt(c.ag, 2));
    continue when exists (select 1 from public.social_post_candidates where dedupe_key = v_key);

    v_text := format(E'GW%s %s v %s, %s: FixtureShark''s expected goals forecast has moved.\n%s %s → %s\n%s %s → %s\nChange since %s. Model: market-rated team ratings.',
                     c.gw, v_home, v_away, to_char(c.kickoff_time at time zone 'Europe/London', 'Dy FMDD Mon'),
                     v_home, private.social_fmt(c.bh, 1), private.social_fmt(c.hg, 1),
                     v_away, private.social_fmt(c.ba, 1), private.social_fmt(c.ag, 1),
                     to_char(c.base_at at time zone 'Europe/London', 'FMDD Mon'));

    insert into public.social_post_candidates (post_type, text, generated_text, source_data, model_version, snapshot_at, dedupe_key,
                                               expires_at, validation_status, detector_run_id)
    values ('team_xg_change', v_text, v_text,
            jsonb_build_object('season_id', v_season, 'gw', c.gw, 'fixture_id', c.fixture_id, 'kickoff_time', c.kickoff_time,
                               'kickoff_date', c.kickoff_date, 'home_team_id', c.home_team_id, 'away_team_id', c.away_team_id,
                               'method', 'market', 'model_version', 'market_ratings',
                               'before', jsonb_build_object('home', c.bh, 'away', c.ba, 'observed_at', c.base_at),
                               'after', jsonb_build_object('home', c.hg, 'away', c.ag, 'rated_at', c.market_rated_at),
                               'projection_model_version', v_mv, 'checks', v_checks),
            'market_ratings', c.market_rated_at, v_key, c.kickoff_time, 'passed', p_run_id)
    returning candidate_id into v_id;
    perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'team_xg_change', 'run_id', p_run_id));
    v_created := v_created + 1;
    v_out := v_out || jsonb_build_object('fixture_id', c.fixture_id, 'status', 'created', 'candidate_id', v_id);
  end loop;

  return jsonb_build_object('status', case when v_created > 0 then 'created' when jsonb_array_length(v_out) > 0 then 'rejected' else 'none' end,
                            'observations_recorded', v_inserted, 'fixtures', v_out,
                            'reason', case when jsonb_array_length(v_out) = 0 then 'no material change against a 2-8 day old forecast' end);
end;
$$;

-- ============================================================================
-- Detector 3: weekly prediction accuracy v baselines
-- ============================================================================
-- The last finished FPL gameweek's Premier League matches, scored as in
-- model_scorecard_matches (the model's pre-match probabilities v closing
-- average odds), plus base rates from the previous five seasons. Only when
-- every match has a result and a scorecard row from one model version.
create or replace function private.social_detect_accuracy(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_start_year integer; v_gw integer; v_checks jsonb := '[]'; v_ok boolean;
  v_fix integer; v_res integer; v_sc integer; v_versions text[]; v_nomkt integer; v_status text;
  v_bh numeric; v_bd numeric; v_ba numeric;
  v_ll_model numeric; v_ll_mkt numeric; v_ll_base numeric; v_hits integer; v_ids bigint[];
  v_key text; v_text text; v_id bigint; v_last_kick timestamptz;
begin
  select start_year into v_start_year from public.seasons where season_id = v_season;
  select max(fpl_event_id) into v_gw from public.fpl_gameweeks where season_id = v_season and finished;
  if v_gw is null then return jsonb_build_object('status', 'none', 'reason', 'no finished gameweek'); end if;

  with gm as (
    select ff.fpl_fixture_id, f.fixture_id, m.match_id, ff.kickoff_time
      from public.fpl_fixtures ff
      join public.fixtures f on f.fixture_id = ff.canonical_fixture_id
      left join public.matches m on m.league_id = f.league_id and m.season_id = f.season_id and m.home_team_id = f.home_team_id
                                and m.away_team_id = f.away_team_id and m.full_time_result is not null
     where ff.season_id = v_season and ff.fpl_event_id = v_gw and ff.kickoff_time is not null)
  select count(*), count(match_id), array_agg(match_id) filter (where match_id is not null), max(kickoff_time)
    into v_fix, v_res, v_ids, v_last_kick from gm;

  v_key := format('prediction_accuracy:%s:%s', v_season, v_gw);
  if exists (select 1 from public.social_post_candidates where dedupe_key like v_key || ':%') then
    return jsonb_build_object('status', 'none', 'reason', format('GW%s already has a candidate', v_gw));
  end if;

  v_checks := v_checks || private.social_check('every fixture has a confirmed result', v_fix > 0 and v_res = v_fix,
                                               jsonb_build_object('gw', v_gw, 'fixtures', v_fix, 'results', v_res));
  select count(*), array_agg(distinct model_version), count(*) filter (where m_home is null or m_draw is null or m_away is null)
    into v_sc, v_versions, v_nomkt
    from public.model_scorecard_matches where match_id = any(coalesce(v_ids, '{}'));
  v_checks := v_checks || private.social_check('every result scored', v_sc = v_res and v_sc > 0, jsonb_build_object('scored', v_sc));
  v_checks := v_checks || private.social_check('one model version across the gameweek', cardinality(v_versions) = 1,
                                               jsonb_build_object('versions', to_jsonb(v_versions)));
  v_checks := v_checks || private.social_check('closing odds for every match', v_nomkt = 0, jsonb_build_object('missing', v_nomkt));
  v_checks := v_checks || private.social_check('at least 8 matches', v_sc >= 8, null);
  select status into v_status from public.pipeline_runs where job_name = 'model_integrity_checks' and status in ('success', 'failed', 'warning')
   order by started_at desc limit 1;
  v_checks := v_checks || private.social_check('latest model integrity check did not fail', v_status is distinct from 'failed',
                                               jsonb_build_object('status', v_status));
  v_checks := v_checks || private.social_check('scorecard refreshed after the last kick-off',
      (select max(finished_at) from public.pipeline_runs where job_name ilike '%scorecard%' and status = 'success') > v_last_kick
      or exists (select 1 from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                  where j.jobname = 'refresh-model-scorecard' and d.status = 'succeeded' and d.end_time > v_last_kick + interval '2 hours'),
      null);

  select bool_and((x->>'ok')::boolean) into v_ok from jsonb_array_elements(v_checks) x;
  if not v_ok then return jsonb_build_object('status', 'rejected', 'gw', v_gw, 'checks', v_checks); end if;

  -- Base rates: previous five complete Premier League seasons.
  select avg((full_time_result = 'H')::int), avg((full_time_result = 'D')::int), avg((full_time_result = 'A')::int)
    into v_bh, v_bd, v_ba
    from public.matches m join public.seasons s on s.season_id = m.season_id
   where m.league_id = 1 and s.start_year between v_start_year - 5 and v_start_year - 1 and m.full_time_result in ('H', 'D', 'A');

  select avg(-ln(case result when 'H' then p_home when 'D' then p_draw else p_away end)),
         avg(-ln(case result when 'H' then m_home when 'D' then m_draw else m_away end)),
         avg(-ln(case result when 'H' then v_bh when 'D' then v_bd else v_ba end)),
         count(*) filter (where result = case when p_home >= greatest(p_draw, p_away) then 'H' when p_away >= p_draw then 'A' else 'D' end)
    into v_ll_model, v_ll_mkt, v_ll_base, v_hits
    from public.model_scorecard_matches where match_id = any(v_ids);

  v_key := v_key || ':' || v_versions[1];
  v_text := format(E'GW%s Premier League: FixtureShark predictions v results (%s matches)\nAverage log loss, lower is better:\nFixtureShark model %s\nBetting market (closing odds) %s\nBase rates %s\nThe model''s most likely result happened in %s of %s.\nModel: %s',
                   v_gw, v_sc, private.social_fmt(v_ll_model, 3), private.social_fmt(v_ll_mkt, 3), private.social_fmt(v_ll_base, 3),
                   v_hits, v_sc, v_versions[1]);

  insert into public.social_post_candidates (post_type, text, generated_text, source_data, model_version, snapshot_at, dedupe_key,
                                             expires_at, validation_status, detector_run_id)
  values ('prediction_accuracy', v_text, v_text,
          jsonb_build_object('season_id', v_season, 'gw', v_gw, 'match_ids', to_jsonb(v_ids), 'n', v_sc,
                             'log_loss', jsonb_build_object('model', v_ll_model, 'market', v_ll_mkt, 'base_rates', v_ll_base),
                             'base_rates', jsonb_build_object('home', v_bh, 'draw', v_bd, 'away', v_ba,
                                                              'seasons', format('%s-%s', v_start_year - 5, v_start_year - 1)),
                             'hits', v_hits, 'model_version', v_versions[1], 'checks', v_checks),
          v_versions[1], now(), v_key, now() + interval '7 days', 'passed', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'prediction_accuracy', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'gw', v_gw, 'checks', v_checks);
end;
$$;

-- ============================================================================
-- Detector 4: verified historical insights (Premier League streaks)
-- ============================================================================
-- An ongoing streak (history_streaks, built from matches) that is a club
-- record in the Premier League data or among the five longest of its kind.
-- Only when every played Premier League fixture has its result loaded, the
-- streak runs to the club's latest match, and its start is not truncated.
create or replace function private.social_detect_streaks(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_missing integer; v_first_year integer; v_checks jsonb; v_ok boolean; c record;
  v_phrase text; v_text text; v_key text; v_id bigint; v_next timestamptz; v_out jsonb := '[]';
begin
  select count(*) into v_missing
    from public.fpl_fixtures ff join public.fixtures f on f.fixture_id = ff.canonical_fixture_id
   where ff.season_id = v_season and ff.kickoff_time < now() - interval '3 hours'
     and not exists (select 1 from public.matches m where m.league_id = f.league_id and m.season_id = f.season_id
                       and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id and m.full_time_result is not null);
  if v_missing > 0 then
    return jsonb_build_object('status', 'rejected', 'checks',
      jsonb_build_array(private.social_check('every played Premier League fixture has a result loaded', false,
                                             jsonb_build_object('missing_results', v_missing))));
  end if;

  select min(s.start_year) into v_first_year from public.matches m join public.seasons s on s.season_id = m.season_id where m.league_id = 1;

  for c in
    select h.*, (select max(length) from public.history_streaks p where p.league_id = 1 and p.team_id = h.team_id
                   and p.streak_type = h.streak_type and not p.ongoing) club_prev_best,
           (select count(*) from public.history_streaks p where p.league_id = 1 and p.streak_type = h.streak_type and p.length > h.length) longer,
           (select count(*) from public.history_streaks p where p.league_id = 1 and p.streak_type = h.streak_type and p.length = h.length
              and (p.team_id, p.start_date) <> (h.team_id, h.start_date)) equal,
           (select max(match_date) from public.matches m where m.league_id = 1 and h.team_id in (m.home_team_id, m.away_team_id)) last_match,
           (select s.start_year from public.seasons s where s.season_id = h.start_season_id) start_year,
           (select s.start_year from public.seasons s where s.season_id = h.end_season_id) end_year
      from public.history_streaks h
     where h.league_id = 1 and h.ongoing and h.length >= 5
     order by h.length desc
  loop
    continue when not (c.length >= coalesce(c.club_prev_best, 0) or c.longer < 5);
    v_checks := '[]';
    v_checks := v_checks || private.social_check('streak start inside the data', not c.truncated_start, null);
    v_checks := v_checks || private.social_check('streak runs to the club''s latest match', c.end_date = c.last_match,
                                                 jsonb_build_object('end_date', c.end_date, 'last_match', c.last_match));
    v_checks := v_checks || private.social_check('no Premier League seasons missing inside the streak',
        (select count(distinct m.season_id) from public.matches m join public.seasons s on s.season_id = m.season_id
          where m.league_id = 1 and c.team_id in (m.home_team_id, m.away_team_id) and s.start_year between c.start_year and c.end_year)
        = c.end_year - c.start_year + 1, null);
    v_checks := v_checks || private.social_check('end match exists', exists (select 1 from public.matches where match_id = c.end_match_id), null);
    select bool_and((x->>'ok')::boolean) into v_ok from jsonb_array_elements(v_checks) x;
    if not v_ok then
      v_out := v_out || jsonb_build_object('team_id', c.team_id, 'streak_type', c.streak_type, 'status', 'rejected', 'checks', v_checks);
      continue;
    end if;

    v_key := format('historical_insight:streak:%s:%s:%s:%s', c.team_id, c.streak_type, c.start_date, c.length);
    continue when exists (select 1 from public.social_post_candidates where dedupe_key = v_key);

    v_phrase := case c.streak_type
      when 'won' then format('have won %s Premier League games in a row', c.length)
      when 'unbeaten' then format('are unbeaten in %s Premier League games', c.length)
      when 'scored' then format('have scored in %s Premier League games in a row', c.length)
      when 'clean_sheet' then format('have kept %s Premier League clean sheets in a row', c.length)
      when 'lost' then format('have lost %s Premier League games in a row', c.length)
      when 'winless' then format('are without a win in %s Premier League games', c.length)
      when 'no_goal' then format('have failed to score in %s Premier League games in a row', c.length)
    end;
    continue when v_phrase is null;

    v_text := format('%s %s.', private.social_team_name(c.team_id), v_phrase);
    if c.club_prev_best is null or c.length > c.club_prev_best then
      v_text := v_text || format(' Their longest such run in the Premier League (since %s/%s)%s.', v_first_year, lpad(((v_first_year + 1) % 100)::text, 2, '0'),
                                 case when c.club_prev_best is not null then format('; previous best %s', c.club_prev_best) else '' end);
    elsif c.length = c.club_prev_best then
      v_text := v_text || format(' That equals their longest such run in the Premier League (since %s/%s).', v_first_year, lpad(((v_first_year + 1) % 100)::text, 2, '0'));
    end if;
    if c.longer < 5 then
      v_text := v_text || format(' %s longest run of its kind in Premier League history.',
                                 case when c.equal > 0 then 'Joint ' || (c.longer + 1) || case (c.longer + 1) when 1 then 'st' when 2 then 'nd' when 3 then 'rd' else 'th' end
                                      else 'The ' || (c.longer + 1) || case (c.longer + 1) when 1 then 'st' when 2 then 'nd' when 3 then 'rd' else 'th' end end);
    end if;
    v_text := replace(v_text, 'The 1st longest', 'The longest');
    v_text := replace(v_text, 'Joint 1st longest', 'Joint longest');

    select min(ff.kickoff_time) into v_next from public.fpl_fixtures ff join public.fixtures f on f.fixture_id = ff.canonical_fixture_id
     where ff.season_id = v_season and ff.kickoff_time > now() and c.team_id in (f.home_team_id, f.away_team_id);

    insert into public.social_post_candidates (post_type, text, generated_text, source_data, model_version, snapshot_at, dedupe_key,
                                               expires_at, validation_status, detector_run_id)
    values ('historical_insight', v_text, v_text,
            jsonb_build_object('kind', 'streak', 'league_id', 1, 'team_id', c.team_id, 'streak_type', c.streak_type, 'length', c.length,
                               'start_date', c.start_date, 'end_date', c.end_date, 'start_match_id', c.start_match_id, 'end_match_id', c.end_match_id,
                               'club_previous_best', c.club_prev_best, 'longer_streaks', c.longer, 'equal_streaks', c.equal,
                               'data_from', v_first_year, 'checks', v_checks),
            null, now(), v_key, coalesce(v_next, now() + interval '7 days'), 'passed', p_run_id)
    returning candidate_id into v_id;
    perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'historical_insight', 'run_id', p_run_id));
    return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'streaks', v_out);
  end loop;

  return jsonb_build_object('status', case when jsonb_array_length(v_out) > 0 then 'rejected' else 'none' end,
                            'streaks', v_out, 'reason', case when jsonb_array_length(v_out) = 0 then 'no ongoing record streak' end);
end;
$$;

-- ============================================================================
-- Run every detector (the scheduled job, or "Run detectors" on /admin/social)
-- ============================================================================
create or replace function public.social_run_detectors(p_triggered_by text default 'schedule')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_run bigint; v_res jsonb := '{}'; v_one jsonb; v_created integer := 0; d text; v_pr bigint;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'admin only'; end if;
  if not (select detector_enabled from public.social_settings) then
    return jsonb_build_object('status', 'disabled');
  end if;
  insert into public.social_detector_runs (triggered_by) values (coalesce(p_triggered_by, 'schedule')) returning run_id into v_run;
  insert into public.pipeline_runs (job_name, started_at, status) values ('social_detect', now(), 'running') returning run_id into v_pr;

  foreach d in array array['captaincy', 'xg_change', 'accuracy', 'streaks'] loop
    begin
      execute format('select private.social_detect_%s($1)', d) into v_one using v_run;
    exception when others then
      v_one := jsonb_build_object('status', 'error', 'error', sqlerrm);
    end;
    v_res := v_res || jsonb_build_object(d, v_one);
    if v_one->>'status' = 'created' then
      v_created := v_created + greatest(1, (select count(*) from jsonb_array_elements(coalesce(v_one->'fixtures', '[]')) f where f->>'status' = 'created'));
    end if;
  end loop;

  update public.social_detector_runs set finished_at = now(), results = v_res, candidates_created = v_created where run_id = v_run;
  update public.pipeline_runs set finished_at = now(),
         status = case when exists (select 1 from jsonb_each(v_res) e where e.value->>'status' = 'error') then 'failed' else 'success' end,
         summary = format('%s candidate(s); %s', v_created,
                          (select string_agg(e.key || ' ' || (e.value->>'status'), ', ') from jsonb_each(v_res) e))
   where run_id = v_pr;
  return jsonb_build_object('run_id', v_run, 'candidates_created', v_created, 'results', v_res);
end;
$$;

-- ============================================================================
-- Revalidation: is the candidate still true right now?
-- ============================================================================
create or replace function private.social_revalidate(p_candidate_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  c public.social_post_candidates; e jsonb := '[]'; s jsonb; v_mv text; v_top jsonb; v_n integer; v_val numeric;
begin
  select * into c from public.social_post_candidates where candidate_id = p_candidate_id;
  if c.candidate_id is null then return jsonb_build_array('candidate not found'); end if;
  s := c.source_data;
  if c.expires_at <= now() then e := e || to_jsonb(format('expired at %s', c.expires_at)); end if;
  if c.validation_status <> 'passed' then e := e || to_jsonb('did not pass validation'::text); end if;
  if public.social_weighted_length(c.text) > 280 then e := e || to_jsonb(format('too long: %s of 280', public.social_weighted_length(c.text))); end if;
  if not (public.social_numbers(c.text) <@ public.social_numbers(c.generated_text)) then
    e := e || to_jsonb('text contains a number that is not in the generated data'::text);
  end if;

  if c.post_type = 'fpl_captaincy' then
    select model_version into v_mv from public.fpl_player_projections where season_id = (s->>'season_id')::bigint order by generated_at desc limit 1;
    if v_mv is distinct from s->>'model_version' then e := e || to_jsonb(format('model version is now %s', v_mv)); end if;
    if (select deadline_time from public.fpl_gameweeks where season_id = (s->>'season_id')::bigint and fpl_event_id = (s->>'gw')::int)
       is distinct from (s->>'deadline')::timestamptz then e := e || to_jsonb('deadline changed'::text); end if;
    v_top := private.social_captaincy_top((s->>'season_id')::bigint, (s->>'gw')::int, s->>'model_version', 5);
    if (select array_agg(t->>'fpl_player_id' order by (t->>'rank')::int) from jsonb_array_elements(v_top) t where (t->>'rank')::int <= 3)
       is distinct from (select array_agg(t->>'fpl_player_id' order by (t->>'rank')::int) from jsonb_array_elements(s->'players') t where (t->>'rank')::int <= 3)
    then e := e || to_jsonb('top three has changed'::text); end if;
    select count(*) into v_n from jsonb_array_elements(s->'players') t
      join public.fpl_players pl on pl.season_id = (s->>'season_id')::bigint and pl.fpl_player_id = (t->>'fpl_player_id')::int
     where pl.now_cost <> (t->>'now_cost')::int or pl.status <> 'a';
    if v_n > 0 then e := e || to_jsonb(format('%s listed player(s) changed price or status', v_n)); end if;
    -- Rounded points still match what the post says.
    select count(*) into v_n from jsonb_array_elements(v_top) t join jsonb_array_elements(s->'players') o on o->>'fpl_player_id' = t->>'fpl_player_id'
     where round((t->>'xpts')::numeric, 1) <> round((o->>'xpts')::numeric, 1);
    if v_n > 0 then e := e || to_jsonb(format('%s projected points value(s) changed', v_n)); end if;

  elsif c.post_type = 'team_xg_change' then
    select abs(f.market_home_goals - (s->'after'->>'home')::numeric) + abs(f.market_away_goals - (s->'after'->>'away')::numeric) into v_val
      from public.fixtures f where f.fixture_id = (s->>'fixture_id')::bigint and f.kickoff_date is not distinct from (s->>'kickoff_date')::date;
    if v_val is null then e := e || to_jsonb('fixture moved or forecast missing'::text);
    elsif v_val > 0.05 then e := e || to_jsonb('forecast has changed again'::text); end if;

  elsif c.post_type = 'prediction_accuracy' then
    select count(*) into v_n from public.model_scorecard_matches
     where match_id in (select jsonb_array_elements_text(s->'match_ids')::bigint) and model_version = s->>'model_version';
    if v_n <> (s->>'n')::int then e := e || to_jsonb('scorecard rows changed'::text); end if;

  elsif c.post_type = 'historical_insight' then
    if not exists (select 1 from public.history_streaks h where h.league_id = 1 and h.team_id = (s->>'team_id')::bigint
                     and h.streak_type = s->>'streak_type' and h.start_date = (s->>'start_date')::date
                     and h.length = (s->>'length')::int and h.ongoing) then
      e := e || to_jsonb('streak has changed'::text);
    end if;
  end if;
  return e;
end;
$$;

-- ============================================================================
-- Admin review actions: approve, reject, edit, schedule, unschedule
-- ============================================================================
create or replace function public.social_review(p_candidate_id bigint, p_action text, p_text text default null,
                                                p_reason text default null, p_scheduled_for timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.social_post_candidates; v_errors jsonb; v_new text;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into c from public.social_post_candidates where candidate_id = p_candidate_id for update;
  if c.candidate_id is null then raise exception 'candidate % not found', p_candidate_id; end if;
  if c.publication_status in ('publishing', 'published', 'needs_check') then
    raise exception 'candidate % is %; it can no longer be changed', p_candidate_id, c.publication_status;
  end if;

  if p_action = 'approve' then
    v_errors := private.social_revalidate(p_candidate_id);
    if jsonb_array_length(v_errors) > 0 then
      update public.social_post_candidates set validation_status = 'stale', validation_errors = v_errors, validated_at = now(), updated_at = now()
       where candidate_id = p_candidate_id;
      perform private.social_audit('approve_refused', p_candidate_id, auth.uid(), jsonb_build_object('errors', v_errors));
      return jsonb_build_object('ok', false, 'errors', v_errors);
    end if;
    update public.social_post_candidates set approval_status = 'approved', approved_by = auth.uid(), approved_at = now(),
           rejected_reason = null, updated_at = now() where candidate_id = p_candidate_id;

  elsif p_action = 'reject' then
    update public.social_post_candidates set approval_status = 'rejected', rejected_reason = p_reason, scheduled_for = null, updated_at = now()
     where candidate_id = p_candidate_id;

  elsif p_action = 'edit' then
    v_new := btrim(coalesce(p_text, ''));
    if v_new = '' then raise exception 'text is empty'; end if;
    if not (public.social_numbers(v_new) <@ public.social_numbers(c.generated_text)) then
      return jsonb_build_object('ok', false, 'errors', jsonb_build_array('an edit may reword but may not add numbers that are not in the generated text'));
    end if;
    if public.social_weighted_length(v_new) > 280 then
      return jsonb_build_object('ok', false, 'errors', jsonb_build_array(format('too long: %s of 280', public.social_weighted_length(v_new))));
    end if;
    -- An edit needs a fresh approval.
    update public.social_post_candidates set text = v_new, approval_status = case when approval_status = 'approved' then 'pending' else approval_status end,
           approved_by = null, approved_at = null, updated_at = now() where candidate_id = p_candidate_id;
    perform private.social_audit('edit', p_candidate_id, auth.uid(), jsonb_build_object('from', c.text, 'to', v_new));
    return jsonb_build_object('ok', true);

  elsif p_action = 'schedule' then
    if c.approval_status <> 'approved' then raise exception 'approve before scheduling'; end if;
    if p_scheduled_for is null or p_scheduled_for >= c.expires_at then raise exception 'schedule time must be before the candidate expires (%)', c.expires_at; end if;
    update public.social_post_candidates set scheduled_for = p_scheduled_for, updated_at = now() where candidate_id = p_candidate_id;

  elsif p_action = 'unschedule' then
    update public.social_post_candidates set scheduled_for = null, updated_at = now() where candidate_id = p_candidate_id;

  else
    raise exception 'unknown action %', p_action;
  end if;

  perform private.social_audit(p_action, p_candidate_id, auth.uid(),
                               jsonb_strip_nulls(jsonb_build_object('reason', p_reason, 'scheduled_for', p_scheduled_for)));
  return jsonb_build_object('ok', true);
end;
$$;

-- Admin settings. auto_publish_enabled is refused until Phase 4.
create or replace function public.social_update_settings(p jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; k text;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('kill_switch', 'live_enabled', 'detector_enabled', 'max_posts_per_day', 'max_posts_per_month',
                 'min_minutes_between_posts', 'monthly_budget_usd', 'allow_urls', 'auto_publish_enabled') then
      raise exception 'setting % cannot be changed here', k;
    end if;
  end loop;
  if coalesce((p->>'auto_publish_enabled')::boolean, false) then
    raise exception 'automatic publishing is not available yet (Phase 4 needs its own reviewed change)';
  end if;
  select to_jsonb(s) into v_before from public.social_settings s;
  update public.social_settings set
    kill_switch = coalesce((p->>'kill_switch')::boolean, kill_switch),
    live_enabled = coalesce((p->>'live_enabled')::boolean, live_enabled),
    detector_enabled = coalesce((p->>'detector_enabled')::boolean, detector_enabled),
    max_posts_per_day = coalesce((p->>'max_posts_per_day')::int, max_posts_per_day),
    max_posts_per_month = coalesce((p->>'max_posts_per_month')::int, max_posts_per_month),
    min_minutes_between_posts = coalesce((p->>'min_minutes_between_posts')::int, min_minutes_between_posts),
    monthly_budget_usd = coalesce((p->>'monthly_budget_usd')::numeric, monthly_budget_usd),
    allow_urls = coalesce((p->>'allow_urls')::boolean, allow_urls),
    updated_at = now(), updated_by = auth.uid();
  perform private.social_audit('settings', null, auth.uid(), jsonb_build_object('before', v_before, 'change', p));
  return jsonb_build_object('ok', true);
end;
$$;

-- Admin: settle a live attempt whose outcome was unknown (timeout / X 5xx).
-- Check @FixtureSharkHQ first: if it posted, give its id; if not, pass null.
create or replace function public.social_resolve_needs_check(p_candidate_id bigint, p_x_post_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_x_post_id is not null and p_x_post_id !~ '^[0-9]{5,25}$' then raise exception 'not an X post id'; end if;
  update public.social_post_candidates
     set publication_status = case when p_x_post_id is null then 'failed' else 'published' end,
         x_post_id = p_x_post_id, published_at = case when p_x_post_id is null then null else now() end, updated_at = now()
   where candidate_id = p_candidate_id and publication_status = 'needs_check';
  if not found then raise exception 'candidate % is not waiting for a check', p_candidate_id; end if;
  perform private.social_audit('resolve_needs_check', p_candidate_id, auth.uid(), jsonb_build_object('x_post_id', p_x_post_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================================
-- Publish gate (called only by the x-publish Edge Function, service role)
-- ============================================================================
-- Dry run: runs every check, records the attempt, changes nothing else, and
-- the Edge Function returns before it touches tokens or X.
-- Live: the same checks plus the kill switch, live gate, connection, rate
-- limits and budget; on success the candidate is locked as 'publishing'.
create or replace function public.social_claim_for_publish(p_candidate_id bigint, p_mode text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.social_settings; x public.social_x_connection; c public.social_post_candidates;
  r jsonb := '[]'; v_url boolean; v_cost numeric; v_day integer; v_month integer; v_spend numeric; v_last timestamptz;
  v_attempt bigint; v_london_today timestamptz; v_london_month timestamptz;
begin
  if p_mode not in ('dry_run', 'live') then raise exception 'mode must be dry_run or live'; end if;
  select * into s from public.social_settings for update;   -- one publisher at a time
  select * into x from public.social_x_connection;
  select * into c from public.social_post_candidates where candidate_id = p_candidate_id for update;
  if c.candidate_id is null then return jsonb_build_object('ok', false, 'reasons', jsonb_build_array('candidate not found')); end if;

  r := private.social_revalidate(p_candidate_id);
  if c.approval_status <> 'approved' then r := r || to_jsonb(format('not approved (%s)', c.approval_status)); end if;
  if c.publication_status not in ('unpublished', 'failed') then r := r || to_jsonb(format('already %s', c.publication_status)); end if;
  if c.publish_attempts >= s.max_live_attempts then r := r || to_jsonb(format('%s live attempts already made', c.publish_attempts)); end if;
  if exists (select 1 from public.social_post_candidates o where o.candidate_id <> c.candidate_id
               and o.publication_status in ('publishing', 'published', 'needs_check')
               and md5(lower(regexp_replace(btrim(o.text), '\s+', ' ', 'g'))) = md5(lower(regexp_replace(btrim(c.text), '\s+', ' ', 'g')))) then
    r := r || to_jsonb('the same text has already been posted'::text);
  end if;
  v_url := public.social_has_url(c.text);
  if v_url and not s.allow_urls then r := r || to_jsonb('links are switched off (a post with a link costs more)'::text); end if;
  v_cost := case when v_url then s.cost_per_post_with_url_usd else s.cost_per_post_usd end;

  v_london_today := date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London';
  v_london_month := date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London';
  select count(*) filter (where started_at >= v_london_today), count(*) filter (where started_at >= v_london_month),
         coalesce(sum(estimated_cost_usd) filter (where started_at >= v_london_month), 0), max(started_at)
    into v_day, v_month, v_spend, v_last
    from public.social_publish_attempts where mode = 'live' and (outcome is null or outcome in ('posted', 'unknown'));

  if p_mode = 'live' then
    if s.kill_switch then r := r || to_jsonb('kill switch is on'::text); end if;
    if not s.live_enabled then r := r || to_jsonb('live publishing is not enabled'::text); end if;
    if x.status <> 'connected' then r := r || to_jsonb(format('X account not connected (%s)', x.status)); end if;
    if lower(coalesce(x.x_username, '')) <> lower(s.allowed_x_username)
       or (s.allowed_x_user_id is not null and x.x_user_id is distinct from s.allowed_x_user_id) then
      r := r || to_jsonb(format('connected account is not @%s', s.allowed_x_username));
    end if;
  end if;
  -- Limits are reported on dry runs too, so a dry run shows what a live attempt would hit.
  if v_day >= s.max_posts_per_day then r := r || to_jsonb(format('daily limit reached (%s)', s.max_posts_per_day)); end if;
  if v_month >= s.max_posts_per_month then r := r || to_jsonb(format('monthly limit reached (%s)', s.max_posts_per_month)); end if;
  if v_last is not null and v_last > now() - make_interval(mins => s.min_minutes_between_posts) then
    r := r || to_jsonb(format('last post was under %s minutes ago', s.min_minutes_between_posts));
  end if;
  if v_spend + v_cost > s.monthly_budget_usd then
    r := r || to_jsonb(format('monthly budget: $%s spent + $%s would exceed $%s', v_spend, v_cost, s.monthly_budget_usd));
  end if;

  insert into public.social_publish_attempts (candidate_id, mode, requested_by, request_text, has_url, estimated_cost_usd, outcome, blocked_reasons, finished_at)
  values (p_candidate_id, p_mode, p_actor, c.text, v_url, case when p_mode = 'live' then v_cost else 0 end,
          case when jsonb_array_length(r) > 0 then 'blocked' when p_mode = 'dry_run' then 'dry_run_ok' end,
          r, case when jsonb_array_length(r) > 0 or p_mode = 'dry_run' then now() end)
  returning attempt_id into v_attempt;
  perform private.social_audit(case when p_mode = 'live' then 'publish_requested' else 'dry_run' end, p_candidate_id, p_actor,
                               jsonb_build_object('attempt_id', v_attempt, 'blocked', r));

  if jsonb_array_length(r) > 0 then
    return jsonb_build_object('ok', false, 'attempt_id', v_attempt, 'reasons', r, 'text', c.text, 'estimated_cost_usd', v_cost);
  end if;
  if p_mode = 'live' then
    update public.social_post_candidates set publication_status = 'publishing', publish_attempts = publish_attempts + 1, updated_at = now()
     where candidate_id = p_candidate_id;
  end if;
  return jsonb_build_object('ok', true, 'attempt_id', v_attempt, 'mode', p_mode, 'text', c.text, 'estimated_cost_usd', v_cost,
                            'spend_this_month_usd', v_spend, 'posts_today', v_day);
end;
$$;

create or replace function public.social_finish_publish(p_attempt_id bigint, p_outcome text, p_http_status integer,
                                                        p_x_post_id text, p_error text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.social_publish_attempts;
begin
  if p_outcome not in ('posted', 'failed', 'unknown') then raise exception 'bad outcome %', p_outcome; end if;
  select * into a from public.social_publish_attempts where attempt_id = p_attempt_id for update;
  if a.attempt_id is null or a.mode <> 'live' or a.outcome is not null then raise exception 'attempt % is not an open live attempt', p_attempt_id; end if;
  update public.social_publish_attempts set outcome = p_outcome, http_status = p_http_status, x_post_id = p_x_post_id,
         error = left(p_error, 2000), finished_at = now(),
         -- a definite failure costs nothing
         estimated_cost_usd = case when p_outcome = 'failed' then 0 else estimated_cost_usd end
   where attempt_id = p_attempt_id;
  update public.social_post_candidates set
         publication_status = case p_outcome when 'posted' then 'published' when 'failed' then 'failed' else 'needs_check' end,
         x_post_id = case when p_outcome = 'posted' then p_x_post_id else x_post_id end,
         published_at = case when p_outcome = 'posted' then now() else published_at end,
         last_error = case when p_outcome = 'posted' then null else left(p_error, 2000) end, updated_at = now()
   where candidate_id = a.candidate_id;
  perform private.social_audit('publish_' || p_outcome, a.candidate_id, a.requested_by,
                               jsonb_strip_nulls(jsonb_build_object('attempt_id', p_attempt_id, 'http_status', p_http_status,
                                                                    'x_post_id', p_x_post_id, 'error', left(p_error, 500))));
end;
$$;

-- ============================================================================
-- OAuth 2.0 (PKCE) state and tokens (service role only)
-- ============================================================================
create or replace function public.social_oauth_begin(p_state_hash text, p_code_verifier text, p_actor uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from private.social_oauth_states where expires_at < now();
  insert into private.social_oauth_states (state_hash, code_verifier, created_by) values (p_state_hash, p_code_verifier, p_actor);
  perform private.social_audit('x_connect_started', null, p_actor, '{}');
end;
$$;

-- Single use: the row is deleted as it is read.
create or replace function public.social_oauth_consume(p_state_hash text)
returns table (code_verifier text, created_by uuid) language sql security definer set search_path = public, pg_temp as $$
  delete from private.social_oauth_states where state_hash = p_state_hash and expires_at > now()
  returning code_verifier, created_by;
$$;

create or replace function public.social_x_store_tokens(p_x_user_id text, p_username text, p_scopes text, p_access_token text,
                                                        p_refresh_token text, p_expires_in integer, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.social_settings; v_sid uuid; v_secret text; v_scopes text[]; v_missing text[]; v_extra text[];
begin
  select * into s from public.social_settings for update;
  if lower(coalesce(p_username, '')) <> lower(s.allowed_x_username)
     or (s.allowed_x_user_id is not null and p_x_user_id is distinct from s.allowed_x_user_id) then
    perform private.social_audit('x_connect_rejected', null, p_actor,
                                 jsonb_build_object('reason', 'wrong account', 'username', p_username, 'x_user_id', p_x_user_id));
    return jsonb_build_object('ok', false, 'reason', 'wrong_account');
  end if;
  v_scopes := string_to_array(btrim(coalesce(p_scopes, '')), ' ');
  select array_agg(x) into v_missing from unnest(array['tweet.read', 'tweet.write', 'users.read', 'offline.access']) x where not (x = any(v_scopes));
  select array_agg(x) into v_extra from unnest(v_scopes) x where x not in ('tweet.read', 'tweet.write', 'users.read', 'offline.access');
  if v_missing is not null or v_extra is not null or coalesce(p_refresh_token, '') = '' then
    perform private.social_audit('x_connect_rejected', null, p_actor,
                                 jsonb_build_object('reason', 'scopes', 'missing', v_missing, 'unexpected', v_extra));
    return jsonb_build_object('ok', false, 'reason', 'scopes');
  end if;

  v_secret := jsonb_build_object('access_token', p_access_token, 'refresh_token', p_refresh_token)::text;
  select id into v_sid from vault.secrets where name = 'x_oauth_fixturesharkhq';
  if v_sid is null then
    v_sid := vault.create_secret(v_secret, 'x_oauth_fixturesharkhq', 'X OAuth 2.0 user tokens for @FixtureSharkHQ (social publishing)');
  else
    perform vault.update_secret(v_sid, v_secret);
  end if;

  update public.social_x_connection set status = 'connected', x_user_id = p_x_user_id, x_username = p_username, scopes = p_scopes,
         connected_at = now(), connected_by = p_actor, access_expires_at = now() + make_interval(secs => p_expires_in),
         last_refreshed_at = now(), token_version = token_version + 1, vault_secret_id = v_sid, last_error = null, updated_at = now();
  update public.social_settings set allowed_x_user_id = coalesce(allowed_x_user_id, p_x_user_id);
  perform private.social_audit('x_connected', null, p_actor, jsonb_build_object('username', p_username, 'x_user_id', p_x_user_id, 'scopes', p_scopes));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.social_x_get_tokens()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('status', x.status, 'x_username', x.x_username, 'token_version', x.token_version,
                            'access_expires_at', x.access_expires_at)
         || coalesce((select d.decrypted_secret::jsonb from vault.decrypted_secrets d where d.id = x.vault_secret_id), '{}')
    from public.social_x_connection x;
$$;

-- Store refreshed tokens only if nobody else refreshed first (X rotates
-- refresh tokens, so the loser must re-read rather than overwrite).
create or replace function public.social_x_rotate_tokens(p_expected_version integer, p_access_token text, p_refresh_token text, p_expires_in integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare x public.social_x_connection;
begin
  select * into x from public.social_x_connection for update;
  if x.status <> 'connected' or x.token_version <> p_expected_version or x.vault_secret_id is null then return false; end if;
  perform vault.update_secret(x.vault_secret_id, jsonb_build_object('access_token', p_access_token, 'refresh_token', p_refresh_token)::text);
  update public.social_x_connection set token_version = token_version + 1, access_expires_at = now() + make_interval(secs => p_expires_in),
         last_refreshed_at = now(), last_error = null, updated_at = now();
  perform private.social_audit('x_token_refreshed', null, null, jsonb_build_object('token_version', x.token_version + 1));
  return true;
end;
$$;

create or replace function public.social_x_mark_error(p_error text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.social_x_connection set status = 'error', last_error = left(p_error, 500), updated_at = now();
  perform private.social_audit('x_connection_error', null, null, jsonb_build_object('error', left(p_error, 500)));
end;
$$;

-- Admin: forget the tokens (revoke the app on X as well: see the runbook).
create or replace function public.social_x_disconnect()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sid uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select vault_secret_id into v_sid from public.social_x_connection;
  if v_sid is not null then delete from vault.secrets where id = v_sid; end if;
  update public.social_x_connection set status = 'disconnected', vault_secret_id = null, access_expires_at = null,
         token_version = token_version + 1, updated_at = now();
  perform private.social_audit('x_disconnected', null, auth.uid(), '{}');
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- function privileges
-- Supabase grants EXECUTE on new public functions to anon and authenticated
-- by default; take it away from everything here, then grant what is needed.
revoke all on function public.social_numbers(text), public.social_has_url(text), public.social_weighted_length(text),
  public.social_run_detectors(text), public.social_review(bigint, text, text, text, timestamptz), public.social_update_settings(jsonb),
  public.social_resolve_needs_check(bigint, text), public.social_claim_for_publish(bigint, text, uuid),
  public.social_finish_publish(bigint, text, integer, text, text), public.social_oauth_begin(text, text, uuid),
  public.social_oauth_consume(text), public.social_x_store_tokens(text, text, text, text, text, integer, uuid),
  public.social_x_get_tokens(), public.social_x_rotate_tokens(integer, text, text, integer), public.social_x_mark_error(text),
  public.social_x_disconnect()
  from public, anon, authenticated;
revoke all on function private.social_audit_append_only(), private.social_check(text, boolean, jsonb),
  private.social_audit(text, bigint, uuid, jsonb), private.social_fmt(numeric, integer), private.social_team_name(bigint),
  private.social_captaincy_top(bigint, integer, text, integer), private.social_detect_captaincy(bigint),
  private.social_detect_xg_change(bigint), private.social_detect_accuracy(bigint), private.social_detect_streaks(bigint),
  private.social_revalidate(bigint)
  from public, anon, authenticated;

-- Admin (checked inside each function with is_admin()).
grant execute on function public.social_run_detectors(text), public.social_review(bigint, text, text, text, timestamptz),
  public.social_update_settings(jsonb), public.social_resolve_needs_check(bigint, text), public.social_x_disconnect(),
  public.social_numbers(text), public.social_has_url(text), public.social_weighted_length(text)
  to authenticated;
-- Edge Functions only.
grant execute on function public.social_claim_for_publish(bigint, text, uuid), public.social_finish_publish(bigint, text, integer, text, text),
  public.social_oauth_begin(text, text, uuid), public.social_oauth_consume(text),
  public.social_x_store_tokens(text, text, text, text, text, integer, uuid), public.social_x_get_tokens(),
  public.social_x_rotate_tokens(integer, text, text, integer), public.social_x_mark_error(text), public.social_run_detectors(text)
  to service_role;

-- ============================================================================
-- Weekly report
-- ============================================================================
create or replace view public.social_weekly_report with (security_invoker = true) as
with w as (
  select date_trunc('week', created_at at time zone 'Europe/London')::date week_start, post_type,
         count(*) generated,
         count(*) filter (where validation_status = 'passed') passed_checks,
         count(*) filter (where approval_status = 'approved') approved,
         count(*) filter (where approval_status = 'rejected') rejected,
         count(*) filter (where approval_status = 'superseded') superseded,
         count(*) filter (where publication_status = 'published') published,
         count(*) filter (where publication_status in ('failed', 'needs_check')) failed
    from public.social_post_candidates group by 1, 2),
a as (
  select date_trunc('week', a.started_at at time zone 'Europe/London')::date week_start, c.post_type,
         count(*) filter (where a.mode = 'dry_run') dry_runs,
         count(*) filter (where a.mode = 'live') live_attempts,
         count(*) filter (where a.outcome = 'blocked') blocked,
         coalesce(sum(a.estimated_cost_usd) filter (where a.mode = 'live' and a.outcome in ('posted', 'unknown')), 0) spend_usd
    from public.social_publish_attempts a join public.social_post_candidates c using (candidate_id) group by 1, 2)
select coalesce(w.week_start, a.week_start) week_start, coalesce(w.post_type, a.post_type) post_type,
       coalesce(w.generated, 0) generated, coalesce(w.passed_checks, 0) passed_checks, coalesce(w.approved, 0) approved,
       coalesce(w.rejected, 0) rejected, coalesce(w.superseded, 0) superseded, coalesce(w.published, 0) published,
       coalesce(w.failed, 0) failed, coalesce(a.dry_runs, 0) dry_runs, coalesce(a.live_attempts, 0) live_attempts,
       coalesce(a.blocked, 0) blocked, coalesce(a.spend_usd, 0) spend_usd
  from w full join a on a.week_start = w.week_start and a.post_type = w.post_type;
comment on view public.social_weekly_report is 'Per week (Monday, UK) and post type: candidates generated, approved, rejected, published and failed (by week created), dry runs, live attempts and spend (by week attempted). Admin-only through RLS.';
revoke all on public.social_weekly_report from anon;
grant select on public.social_weekly_report to authenticated;

-- ============================================================================
-- Schedule: the detector only (writes candidates; publishes nothing)
-- ============================================================================
select cron.schedule('social-detect-candidates', '25 1,7,13,19 * * *', $$select public.social_run_detectors('schedule')$$);

-- ============================================================================
-- Social publishing, Phase 4: automatic posting to X (@FixtureSharkHQ).
-- Chris, 20 Oct 2026: "one link a week and a hold period ... I don't need to
-- shadow ... go live". Design: project doc social-publishing-phase4-design.
--
-- What changes
--   * Two new detectors: overnight FPL price changes (each morning) and the
--     gameweek preview / reflection threads (from fpl_gameweek_reports).
--   * Automatic post types (settings.auto_post_types): price changes,
--     captaincy, preview/reflection threads, prediction accuracy. Team xG
--     changes and record streaks stay manual (approve + Publish).
--   * Auto queue: a passing candidate of an automatic type is approved by the
--     system with a hold time (default 60 minutes; captaincy waits until 24h
--     before the deadline). Chris is emailed (social-notify) when the hold
--     starts and can press Hold on /admin/social to stop it.
--   * Worker: pg_cron every 10 minutes (social_auto_tick) posts at most one
--     due candidate through the same gate as a manual post
--     (social_claim_for_publish): revalidation, limits, budget, kill switch.
--     Posting hours 07:00-22:00 UK.
--   * Threads: a candidate can carry several posts; x-publish posts them as
--     replies. Counted as one post for the daily/monthly limits, costed per
--     post.
--   * Links: allowed, at most max_links_per_week (1) posts with a link per
--     UK week (the preview thread's first post).
--   * Circuit breaker: a failed or unconfirmed automatic post, or one stuck
--     'publishing', switches automatic posting off and emails Chris. Only an
--     admin resets it (/admin/social).
--   * Settings flipped here, at Chris's request: kill switch off, automatic
--     publishing on, links on (weekly limit 1), budget $5/month, 60 posts a
--     month.
-- Nothing else existing is changed.
-- ============================================================================

-- ---------------------------------------------------------------- columns
alter table public.social_post_candidates drop constraint if exists social_post_candidates_post_type_check;
alter table public.social_post_candidates add constraint social_post_candidates_post_type_check
  check (post_type in ('fpl_captaincy', 'team_xg_change', 'prediction_accuracy', 'historical_insight', 'announcement',
                       'fpl_price_changes', 'gameweek_thread'));
alter table public.social_post_candidates
  add column if not exists thread jsonb,                      -- several posts: text is them joined by blank lines
  add column if not exists auto boolean not null default false,
  add column if not exists hold_until timestamptz,
  add column if not exists held boolean not null default false,
  add column if not exists notified_at timestamptz,
  add column if not exists x_post_ids jsonb;
comment on column public.social_post_candidates.thread is 'Posts of a thread, in order (replies to the first). Null = a single post (text).';
comment on column public.social_post_candidates.auto is 'Approved by the system for automatic posting (Phase 4); posts after hold_until unless held.';

alter table public.social_publish_attempts add column if not exists posts integer not null default 1;

alter table public.social_settings
  add column if not exists hold_minutes integer not null default 60 check (hold_minutes between 0 and 1440),
  add column if not exists max_links_per_week integer not null default 1 check (max_links_per_week between 0 and 20),
  add column if not exists auto_post_types text[] not null default '{}',
  add column if not exists post_hours_from integer not null default 7 check (post_hours_from between 0 and 23),
  add column if not exists post_hours_to integer not null default 22 check (post_hours_to between 1 and 24),
  add column if not exists breaker_tripped_at timestamptz,
  add column if not exists breaker_reason text,
  add column if not exists notify_email text;   -- null = the admin's own address (app_users)

-- The worker's shared secret (pg_cron -> Edge Functions). Never leaves the database
-- except in the worker's own requests; Edge Functions check it with social_worker_ok.
create table if not exists private.social_worker (
  id boolean primary key default true check (id),
  token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into private.social_worker (id) values (true) on conflict (id) do nothing;
revoke all on private.social_worker from public, anon, authenticated;

create or replace function public.social_worker_ok(p_token text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(p_token, '') <> '' and p_token = (select token from private.social_worker);
$$;
revoke all on function public.social_worker_ok(text) from public, anon, authenticated;
grant execute on function public.social_worker_ok(text) to service_role;

-- ---------------------------------------------------------------- settings (Chris, 20 Oct)
update public.social_settings set
  kill_switch = false,
  live_enabled = true,
  auto_publish_enabled = true,
  allow_urls = true,
  max_links_per_week = 1,
  monthly_budget_usd = greatest(monthly_budget_usd, 5),
  max_posts_per_month = greatest(max_posts_per_month, 60),
  hold_minutes = 60,
  auto_post_types = array['fpl_price_changes', 'fpl_captaincy', 'gameweek_thread', 'prediction_accuracy'],
  updated_at = now()
where id;
insert into public.social_audit_log (action, detail)
values ('settings', jsonb_build_object('source', 'migration 20261020210000_social_autopublish',
        'change', 'automatic publishing on (Chris, 20 Oct 2026): kill switch off, links on with 1 a week, budget $5, 60 a month, hold 60 min'));

-- ============================================================================
-- Text helpers
-- ============================================================================
-- Every post of a candidate (a thread's posts, or the single text).
create or replace function private.social_posts(c public.social_post_candidates)
returns text[] language sql immutable as $$
  select case when c.thread is null or jsonb_typeof(c.thread) <> 'array' or jsonb_array_length(c.thread) = 0 then array[c.text]
              else array(select jsonb_array_elements_text(c.thread)) end;
$$;

-- ============================================================================
-- Detector 5: overnight FPL price changes
-- ============================================================================
-- Each morning: today's FPL prices (refreshed after FPL's ~01:30 UK update)
-- against yesterday evening's snapshot. Nothing is predicted.
create or replace function private.social_detect_price_changes(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_today date := (now() at time zone 'Europe/London')::date;
  v_checks jsonb := '[]'; v_ok boolean; v_ts timestamptz; v_n integer;
  v_rows jsonb; v_key text; v_text text; v_line text; v_id bigint; r jsonb; v_up text[] := '{}'; v_down text[] := '{}';
  v_nup integer; v_ndown integer; v_shown_up integer := 0; v_shown_down integer := 0;
begin
  if extract(hour from now() at time zone 'Europe/London') < 6 or extract(hour from now() at time zone 'Europe/London') >= 12 then
    return jsonb_build_object('status', 'none', 'reason', 'price changes are checked in the morning');
  end if;
  v_key := format('fpl_price_changes:%s:%s', v_season, v_today);
  if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
    return jsonb_build_object('status', 'none', 'reason', 'already made today');
  end if;

  select max(completed_at) into v_ts from public.fpl_ingestion_runs where status = 'success';
  v_checks := v_checks || private.social_check('FPL refreshed after the overnight price update',
      v_ts >= (v_today::timestamp + interval '2 hours') at time zone 'Europe/London', jsonb_build_object('last_success', v_ts));
  select count(*) into v_n from public.fpl_player_snapshots where season_id = v_season and snapshot_date = v_today - 1;
  v_checks := v_checks || private.social_check('yesterday''s price snapshot exists', v_n >= 500, jsonb_build_object('players', v_n));

  with y as (select distinct on (fpl_player_id) fpl_player_id, now_cost from public.fpl_player_snapshots
              where season_id = v_season and snapshot_date = v_today - 1 order by fpl_player_id, captured_at desc),
  ch as (select p.fpl_player_id, p.web_name, coalesce(t.short_name, '') team, y.now_cost before, p.now_cost now,
                coalesce(p.selected_by_percent, 0)::numeric own
           from public.fpl_players p join y using (fpl_player_id)
           left join public.fpl_teams t on t.season_id = p.season_id and t.fpl_team_id = p.fpl_team_id
          where p.season_id = v_season and p.now_cost is distinct from y.now_cost and p.now_cost is not null and y.now_cost is not null)
  select coalesce(jsonb_agg(to_jsonb(ch) order by own desc, fpl_player_id), '[]') into v_rows from ch;

  select bool_and((c->>'ok')::boolean) into v_ok from jsonb_array_elements(v_checks) c;
  if not v_ok then return jsonb_build_object('status', 'rejected', 'checks', v_checks); end if;
  -- More than 60 moves in a night means a snapshot problem, not a market.
  v_checks := v_checks || private.social_check('a believable number of changes', jsonb_array_length(v_rows) <= 60,
                                               jsonb_build_object('changes', jsonb_array_length(v_rows)));
  if jsonb_array_length(v_rows) > 60 then return jsonb_build_object('status', 'rejected', 'checks', v_checks); end if;
  if jsonb_array_length(v_rows) = 0 then return jsonb_build_object('status', 'none', 'reason', 'no price changes overnight'); end if;

  select count(*) filter (where (e->>'now')::int > (e->>'before')::int), count(*) filter (where (e->>'now')::int < (e->>'before')::int)
    into v_nup, v_ndown from jsonb_array_elements(v_rows) e;
  -- Most-owned first, as many as fit in one post.
  for r in select e from jsonb_array_elements(v_rows) e loop
    v_line := format('%s %s £%sm', r->>'web_name', r->>'team', private.social_fmt((r->>'now')::numeric / 10, 1));
    v_text := private.social_price_text(
      case when (r->>'now')::int > (r->>'before')::int then v_up || v_line else v_up end,
      case when (r->>'now')::int < (r->>'before')::int then v_down || v_line else v_down end, v_nup, v_ndown);
    if public.social_weighted_length(v_text) <= 280 then
      if (r->>'now')::int > (r->>'before')::int then v_up := v_up || v_line; else v_down := v_down || v_line; end if;
    end if;
  end loop;
  v_text := private.social_price_text(v_up, v_down, v_nup, v_ndown);

  insert into public.social_post_candidates (post_type, text, generated_text, source_data, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('fpl_price_changes', v_text, v_text,
          jsonb_build_object('season_id', v_season, 'date', v_today, 'changes', v_rows, 'checks', v_checks),
          coalesce(v_ts, now()), v_key, (v_today::timestamp + interval '21 hours') at time zone 'Europe/London', 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'fpl_price_changes', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'changes', jsonb_array_length(v_rows), 'checks', v_checks);
end;
$$;

create or replace function private.social_price_text(p_up text[], p_down text[], p_nup integer, p_ndown integer)
returns text language sql immutable as $$
  select 'FPL price changes overnight'
      || case when p_nup > 0 then E'\n' || 'Up: ' || coalesce(array_to_string(p_up, ', '), '')
              || case when p_nup > coalesce(array_length(p_up, 1), 0) then format(' and %s more', p_nup - coalesce(array_length(p_up, 1), 0)) else '' end
              else '' end
      || case when p_ndown > 0 then E'\n' || 'Down: ' || coalesce(array_to_string(p_down, ', '), '')
              || case when p_ndown > coalesce(array_length(p_down, 1), 0) then format(' and %s more', p_ndown - coalesce(array_length(p_down, 1), 0)) else '' end
              else '' end;
$$;

-- ============================================================================
-- Detector 6: gameweek preview and reflection threads
-- ============================================================================
-- From the newest published report (scripts/fpl_gameweek_report.py), once per
-- gameweek and kind. Posts with a link are dropped, except the preview's,
-- whose link goes on the first post (the week's one link).
create or replace function private.social_detect_gameweek_threads(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  rep record; v_posts text[]; v_url text; v_key text; v_text text; v_id bigint; v_checks jsonb; v_expires timestamptz;
  v_out jsonb := '[]'; v_too_long integer;
begin
  for rep in
    select distinct on (r.kind) r.report_id, r.season_label, r.fpl_event_id gw, r.kind, r.version, r.published_at, r.x_thread
      from public.fpl_gameweek_reports r
     where r.season_id = v_season and r.status = 'published' and not r.frozen
       and r.published_at > now() - interval '4 days'
     order by r.kind, r.fpl_event_id desc, r.version desc
  loop
    if exists (select 1 from public.social_post_candidates c where c.post_type = 'gameweek_thread'
                 and (c.source_data->>'season_id')::bigint = v_season and (c.source_data->>'gw')::int = rep.gw
                 and c.source_data->>'kind' = rep.kind and c.publication_status in ('publishing', 'published', 'needs_check')) then
      v_out := v_out || jsonb_build_object('kind', rep.kind, 'gw', rep.gw, 'status', 'none', 'reason', 'already posted');
      continue;
    end if;
    v_key := format('gameweek_thread:%s:%s:%s:v%s', v_season, rep.gw, rep.kind, rep.version);
    if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
      v_out := v_out || jsonb_build_object('kind', rep.kind, 'gw', rep.gw, 'status', 'none', 'reason', 'version already queued');
      continue;
    end if;

    v_url := format('https://fixtureshark.com/fpl/gameweek/%s/%s/%s', rep.season_label, rep.gw, rep.kind);
    -- Links come out of every post; a post that was only a link ("...: <url>") goes.
    select array_agg(q order by n) into v_posts
      from (select n, btrim(regexp_replace(p, '\s*https?://\S+', '', 'g')) q
              from jsonb_array_elements_text(coalesce(rep.x_thread, '[]')) with ordinality t(p, n)) x
     where q <> '' and q !~ ':$' and not public.social_has_url(q);
    if rep.kind = 'preview' and v_posts is not null then
      v_posts[1] := v_posts[1] || ' ' || v_url;
    end if;
    select count(*) into v_too_long from unnest(coalesce(v_posts, '{}')) p where public.social_weighted_length(p) > 280;
    v_checks := jsonb_build_array(
      private.social_check('thread has posts', coalesce(array_length(v_posts, 1), 0) >= 2, jsonb_build_object('posts', coalesce(array_length(v_posts, 1), 0))),
      private.social_check('every post within 280', v_too_long = 0, jsonb_build_object('too_long', v_too_long)));
    if coalesce(array_length(v_posts, 1), 0) < 2 or v_too_long > 0 then
      v_out := v_out || jsonb_build_object('kind', rep.kind, 'gw', rep.gw, 'status', 'rejected', 'checks', v_checks);
      continue;
    end if;

    select deadline_time into v_expires from public.fpl_gameweeks
     where season_id = v_season and fpl_event_id = case when rep.kind = 'preview' then rep.gw else rep.gw + 1 end;
    v_expires := coalesce(v_expires, now() + interval '3 days');
    v_text := array_to_string(v_posts, E'\n\n');

    -- A newer version replaces an older one that hasn't gone out.
    update public.social_post_candidates set approval_status = 'superseded', updated_at = now()
     where post_type = 'gameweek_thread' and approval_status in ('pending', 'approved') and publication_status in ('unpublished', 'failed')
       and (source_data->>'season_id')::bigint = v_season and (source_data->>'gw')::int = rep.gw and source_data->>'kind' = rep.kind;

    insert into public.social_post_candidates (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key,
                                               expires_at, validation_status, validation_errors, detector_run_id)
    values ('gameweek_thread', v_text, v_text, to_jsonb(v_posts),
            jsonb_build_object('season_id', v_season, 'gw', rep.gw, 'kind', rep.kind, 'report_id', rep.report_id,
                               'version', rep.version, 'url', v_url, 'checks', v_checks),
            rep.published_at, v_key, v_expires, 'passed', '[]', p_run_id)
    returning candidate_id into v_id;
    perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'gameweek_thread', 'run_id', p_run_id));
    v_out := v_out || jsonb_build_object('kind', rep.kind, 'gw', rep.gw, 'status', 'created', 'candidate_id', v_id);
  end loop;
  return jsonb_build_object('status', case when exists (select 1 from jsonb_array_elements(v_out) e where e->>'status' = 'created') then 'created' else 'none' end,
                            'fixtures', v_out);
end;
$$;

-- ============================================================================
-- Revalidation (all types; the new branches are price changes and threads)
-- ============================================================================
create or replace function private.social_revalidate(p_candidate_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  c public.social_post_candidates; e jsonb := '[]'; s jsonb; v_mv text; v_top jsonb; v_n integer; v_val numeric; p text;
begin
  select * into c from public.social_post_candidates where candidate_id = p_candidate_id;
  if c.candidate_id is null then return jsonb_build_array('candidate not found'); end if;
  s := c.source_data;
  if c.expires_at <= now() then e := e || to_jsonb(format('expired at %s', c.expires_at)); end if;
  if c.validation_status <> 'passed' then e := e || to_jsonb('did not pass validation'::text); end if;
  foreach p in array private.social_posts(c) loop
    if public.social_weighted_length(p) > 280 then e := e || to_jsonb(format('too long: %s of 280', public.social_weighted_length(p))); end if;
  end loop;
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

  elsif c.post_type = 'fpl_price_changes' then
    -- Every listed player still has the price the post gives.
    select count(*) into v_n from jsonb_array_elements(s->'changes') t
      join public.fpl_players pl on pl.season_id = (s->>'season_id')::bigint and pl.fpl_player_id = (t->>'fpl_player_id')::int
     where pl.now_cost <> (t->>'now')::int;
    if v_n > 0 then e := e || to_jsonb(format('%s player(s) changed price again', v_n)); end if;

  elsif c.post_type = 'gameweek_thread' then
    if exists (select 1 from public.fpl_gameweek_reports r where r.season_id = (s->>'season_id')::bigint and r.fpl_event_id = (s->>'gw')::int
                 and r.kind = s->>'kind' and r.status = 'published' and not r.frozen and r.version > (s->>'version')::int) then
      e := e || to_jsonb('a newer version of the report was published'::text);
    end if;
  end if;
  return e;
end;
$$;

-- ============================================================================
-- Limits shared by the gate and the worker
-- ============================================================================
create or replace function private.social_limit_reasons(p_cost numeric, p_has_url boolean)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.social_settings; r jsonb := '[]'; v_day integer; v_month integer; v_spend numeric; v_last timestamptz; v_links integer;
  v_today timestamptz := date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London';
  v_month0 timestamptz := date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London';
  v_week0 timestamptz := date_trunc('week', now() at time zone 'Europe/London') at time zone 'Europe/London';
begin
  select * into s from public.social_settings;
  select count(*) filter (where started_at >= v_today), count(*) filter (where started_at >= v_month0),
         coalesce(sum(estimated_cost_usd) filter (where started_at >= v_month0), 0), max(started_at),
         count(*) filter (where started_at >= v_week0 and has_url)
    into v_day, v_month, v_spend, v_last, v_links
    from public.social_publish_attempts where mode = 'live' and (outcome is null or outcome in ('posted', 'unknown'));
  if p_has_url and not s.allow_urls then r := r || to_jsonb('links are switched off (a post with a link costs more)'::text); end if;
  if p_has_url and v_links >= s.max_links_per_week then r := r || to_jsonb(format('weekly link limit reached (%s)', s.max_links_per_week)); end if;
  if v_day >= s.max_posts_per_day then r := r || to_jsonb(format('daily limit reached (%s)', s.max_posts_per_day)); end if;
  if v_month >= s.max_posts_per_month then r := r || to_jsonb(format('monthly limit reached (%s)', s.max_posts_per_month)); end if;
  if v_last is not null and v_last > now() - make_interval(mins => s.min_minutes_between_posts) then
    r := r || to_jsonb(format('last post was under %s minutes ago', s.min_minutes_between_posts));
  end if;
  if v_spend + p_cost > s.monthly_budget_usd then
    r := r || to_jsonb(format('monthly budget: $%s spent + $%s would exceed $%s', v_spend, p_cost, s.monthly_budget_usd));
  end if;
  return r;
end;
$$;

-- Cost of a candidate: each post, the link price for posts with a link.
create or replace function private.social_cost(c public.social_post_candidates)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(case when public.social_has_url(p) then s.cost_per_post_with_url_usd else s.cost_per_post_usd end), 0)
    from unnest(private.social_posts(c)) p, public.social_settings s;
$$;

-- ============================================================================
-- Publish gate (now thread-aware; p_actor null = the automatic worker)
-- ============================================================================
create or replace function public.social_claim_for_publish(p_candidate_id bigint, p_mode text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.social_settings; x public.social_x_connection; c public.social_post_candidates;
  r jsonb := '[]'; v_url boolean; v_cost numeric; v_attempt bigint; v_posts text[];
begin
  if p_mode not in ('dry_run', 'live') then raise exception 'mode must be dry_run or live'; end if;
  select * into s from public.social_settings for update;   -- one publisher at a time
  select * into x from public.social_x_connection;
  select * into c from public.social_post_candidates where candidate_id = p_candidate_id for update;
  if c.candidate_id is null then return jsonb_build_object('ok', false, 'reasons', jsonb_build_array('candidate not found')); end if;
  v_posts := private.social_posts(c);

  r := private.social_revalidate(p_candidate_id);
  if c.approval_status <> 'approved' then r := r || to_jsonb(format('not approved (%s)', c.approval_status)); end if;
  if c.publication_status not in ('unpublished', 'failed') then r := r || to_jsonb(format('already %s', c.publication_status)); end if;
  if c.publish_attempts >= s.max_live_attempts then r := r || to_jsonb(format('%s live attempts already made', c.publish_attempts)); end if;
  if p_actor is null then
    if c.held then r := r || to_jsonb('on hold'::text); end if;
    if not c.auto then r := r || to_jsonb('not queued for automatic posting'::text); end if;
    if not s.auto_publish_enabled then r := r || to_jsonb('automatic publishing is off'::text); end if;
    if s.breaker_tripped_at is not null then r := r || to_jsonb(format('circuit breaker tripped: %s', s.breaker_reason)); end if;
  end if;
  if exists (select 1 from public.social_post_candidates o where o.candidate_id <> c.candidate_id
               and o.publication_status in ('publishing', 'published', 'needs_check')
               and md5(lower(regexp_replace(btrim(o.text), '\s+', ' ', 'g'))) = md5(lower(regexp_replace(btrim(c.text), '\s+', ' ', 'g')))) then
    r := r || to_jsonb('the same text has already been posted'::text);
  end if;
  v_url := exists (select 1 from unnest(v_posts) p where public.social_has_url(p));
  v_cost := private.social_cost(c);

  if p_mode = 'live' then
    if s.kill_switch then r := r || to_jsonb('kill switch is on'::text); end if;
    if not s.live_enabled then r := r || to_jsonb('live publishing is not enabled'::text); end if;
    if x.status <> 'connected' then r := r || to_jsonb(format('X account not connected (%s)', x.status)); end if;
    if lower(coalesce(x.x_username, '')) <> lower(s.allowed_x_username)
       or (s.allowed_x_user_id is not null and x.x_user_id is distinct from s.allowed_x_user_id) then
      r := r || to_jsonb(format('connected account is not @%s', s.allowed_x_username));
    end if;
  end if;
  r := r || private.social_limit_reasons(v_cost, v_url);

  insert into public.social_publish_attempts (candidate_id, mode, requested_by, request_text, has_url, estimated_cost_usd, outcome,
                                              blocked_reasons, finished_at, posts)
  values (p_candidate_id, p_mode, p_actor, c.text, v_url, case when p_mode = 'live' then v_cost else 0 end,
          case when jsonb_array_length(r) > 0 then 'blocked' when p_mode = 'dry_run' then 'dry_run_ok' end,
          r, case when jsonb_array_length(r) > 0 or p_mode = 'dry_run' then now() end, coalesce(array_length(v_posts, 1), 1))
  returning attempt_id into v_attempt;
  perform private.social_audit(case when p_mode = 'live' then 'publish_requested' else 'dry_run' end, p_candidate_id, p_actor,
                               jsonb_build_object('attempt_id', v_attempt, 'blocked', r, 'automatic', p_actor is null));

  if jsonb_array_length(r) > 0 then
    return jsonb_build_object('ok', false, 'attempt_id', v_attempt, 'reasons', r, 'text', c.text, 'thread', to_jsonb(v_posts), 'estimated_cost_usd', v_cost);
  end if;
  if p_mode = 'live' then
    update public.social_post_candidates set publication_status = 'publishing', publish_attempts = publish_attempts + 1, updated_at = now()
     where candidate_id = p_candidate_id;
  end if;
  return jsonb_build_object('ok', true, 'attempt_id', v_attempt, 'mode', p_mode, 'text', c.text, 'thread', to_jsonb(v_posts),
                            'estimated_cost_usd', v_cost);
end;
$$;

-- ============================================================================
-- Circuit breaker
-- ============================================================================
create or replace function private.social_trip_breaker(p_reason text, p_candidate_id bigint default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.social_settings set breaker_tripped_at = now(), breaker_reason = left(p_reason, 500), updated_at = now()
   where id and breaker_tripped_at is null;
  if found then
    perform private.social_audit('breaker_tripped', p_candidate_id, null, jsonb_build_object('reason', p_reason));
    perform private.social_notify(jsonb_build_object('kind', 'breaker', 'reason', p_reason, 'candidate_id', p_candidate_id));
  end if;
end;
$$;

-- Fire-and-forget call to the social-notify Edge Function (email to Chris).
create or replace function private.social_notify(p_body jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform net.http_post(
    url := 'https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1/social-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-social-token', (select token from private.social_worker)),
    body := p_body, timeout_milliseconds := 30000);
exception when others then
  perform private.social_audit('notify_error', (p_body->>'candidate_id')::bigint, null, jsonb_build_object('error', sqlerrm));
end;
$$;

-- Finish a live attempt (thread-aware). An automatic post that failed or
-- whose outcome is unknown trips the breaker.
create or replace function public.social_finish_publish(p_attempt_id bigint, p_outcome text, p_http_status integer,
                                                        p_x_post_id text, p_error text, p_x_post_ids jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.social_publish_attempts;
begin
  if p_outcome not in ('posted', 'failed', 'unknown') then raise exception 'bad outcome %', p_outcome; end if;
  select * into a from public.social_publish_attempts where attempt_id = p_attempt_id for update;
  if a.attempt_id is null or a.mode <> 'live' or a.outcome is not null then raise exception 'attempt % is not an open live attempt', p_attempt_id; end if;
  update public.social_publish_attempts set outcome = p_outcome, http_status = p_http_status, x_post_id = p_x_post_id,
         error = left(p_error, 2000), finished_at = now(),
         estimated_cost_usd = case when p_outcome = 'failed' then 0 else estimated_cost_usd end
   where attempt_id = p_attempt_id;
  update public.social_post_candidates set
         publication_status = case p_outcome when 'posted' then 'published' when 'failed' then 'failed' else 'needs_check' end,
         x_post_id = case when p_outcome in ('posted', 'unknown') then coalesce(p_x_post_id, x_post_id) else x_post_id end,
         x_post_ids = coalesce(p_x_post_ids, x_post_ids),
         published_at = case when p_outcome = 'posted' then now() else published_at end,
         last_error = case when p_outcome = 'posted' and p_error is null then null else left(p_error, 2000) end, updated_at = now()
   where candidate_id = a.candidate_id;
  perform private.social_audit('publish_' || p_outcome, a.candidate_id, a.requested_by,
                               jsonb_strip_nulls(jsonb_build_object('attempt_id', p_attempt_id, 'http_status', p_http_status,
                                                                    'x_post_id', p_x_post_id, 'x_post_ids', p_x_post_ids, 'error', left(p_error, 500))));
  if a.requested_by is null and (p_outcome <> 'posted' or p_error is not null) then
    perform private.social_trip_breaker(format('automatic post #%s: %s', a.candidate_id, coalesce(p_error, p_outcome)), a.candidate_id);
  end if;
end;
$$;
revoke all on function public.social_finish_publish(bigint, text, integer, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.social_finish_publish(bigint, text, integer, text, text, jsonb) to service_role;

-- The old 5-argument form now goes through the new one.
create or replace function public.social_finish_publish(p_attempt_id bigint, p_outcome text, p_http_status integer,
                                                        p_x_post_id text, p_error text)
returns void language sql security definer set search_path = public, pg_temp as $$
  select public.social_finish_publish(p_attempt_id, p_outcome, p_http_status, p_x_post_id, p_error, null::jsonb);
$$;

-- ============================================================================
-- Auto queue: approve passing candidates of automatic types, with a hold
-- ============================================================================
create or replace function private.social_auto_queue()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.social_settings; c record; v_errors jsonb; v_hold timestamptz; n integer := 0;
begin
  select * into s from public.social_settings;
  if not s.auto_publish_enabled then return 0; end if;
  for c in
    select * from public.social_post_candidates
     where approval_status = 'pending' and publication_status = 'unpublished' and validation_status = 'passed'
       and post_type = any(s.auto_post_types) and expires_at > now() and created_at > now() - interval '2 days'
     order by created_at
  loop
    v_errors := private.social_revalidate(c.candidate_id);
    if jsonb_array_length(v_errors) > 0 then
      update public.social_post_candidates set validation_status = 'stale', validation_errors = v_errors, validated_at = now(), updated_at = now()
       where candidate_id = c.candidate_id;
      continue;
    end if;
    v_hold := now() + make_interval(mins => s.hold_minutes);
    if c.post_type = 'fpl_captaincy' then
      v_hold := greatest(v_hold, (c.source_data->>'deadline')::timestamptz - interval '24 hours');
    end if;
    -- One queued post per type and expiry (e.g. one captaincy post per deadline).
    update public.social_post_candidates set approval_status = 'superseded', updated_at = now()
     where post_type = c.post_type and candidate_id <> c.candidate_id and expires_at = c.expires_at
       and coalesce(source_data->>'kind', '') = coalesce(c.source_data->>'kind', '')
       and approval_status = 'approved' and auto and publication_status in ('unpublished', 'failed');
    update public.social_post_candidates set approval_status = 'approved', approved_at = now(), approved_by = null,
           auto = true, hold_until = v_hold, updated_at = now()
     where candidate_id = c.candidate_id;
    perform private.social_audit('auto_queued', c.candidate_id, null, jsonb_build_object('hold_until', v_hold));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ============================================================================
-- Worker: every 10 minutes
-- ============================================================================
create or replace function public.social_auto_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.social_settings; c public.social_post_candidates; v_errors jsonb; v_limits jsonb; v_hour integer;
  v_queued integer; v_notified integer := 0; v_url boolean;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'admin only'; end if;
  select * into s from public.social_settings;
  if not s.auto_publish_enabled then return jsonb_build_object('status', 'off'); end if;
  v_queued := private.social_auto_queue();

  -- A post stuck 'publishing' for 15 minutes: the worker died mid-post.
  for c in select * from public.social_post_candidates where publication_status = 'publishing' and updated_at < now() - interval '15 minutes' loop
    update public.social_post_candidates set publication_status = 'needs_check', last_error = 'stuck publishing for 15 minutes', updated_at = now()
     where candidate_id = c.candidate_id;
    update public.social_publish_attempts set outcome = 'unknown', finished_at = now(), error = 'stuck publishing'
     where candidate_id = c.candidate_id and mode = 'live' and outcome is null;
    perform private.social_trip_breaker(format('post #%s stuck publishing', c.candidate_id), c.candidate_id);
  end loop;

  -- Emails: when a queued post's hold starts.
  for c in select * from public.social_post_candidates
            where auto and approval_status = 'approved' and publication_status = 'unpublished' and not held and notified_at is null
              and hold_until - make_interval(mins => s.hold_minutes) <= now() and expires_at > now()
  loop
    update public.social_post_candidates set notified_at = now() where candidate_id = c.candidate_id;
    perform private.social_notify(jsonb_build_object('kind', 'queued', 'candidate_id', c.candidate_id));
    v_notified := v_notified + 1;
  end loop;

  if s.kill_switch or not s.live_enabled or s.breaker_tripped_at is not null then
    return jsonb_build_object('status', 'paused', 'queued', v_queued, 'notified', v_notified,
                              'reason', case when s.breaker_tripped_at is not null then 'circuit breaker' when s.kill_switch then 'kill switch' else 'live off' end);
  end if;
  v_hour := extract(hour from now() at time zone 'Europe/London');
  if v_hour < s.post_hours_from or v_hour >= s.post_hours_to then
    return jsonb_build_object('status', 'outside posting hours', 'queued', v_queued, 'notified', v_notified);
  end if;
  if exists (select 1 from public.social_post_candidates where publication_status = 'publishing') then
    return jsonb_build_object('status', 'a post is in flight', 'queued', v_queued, 'notified', v_notified);
  end if;

  for c in select * from public.social_post_candidates
            where auto and approval_status = 'approved' and publication_status in ('unpublished') and not held
              and hold_until <= now() and expires_at > now() and notified_at is not null
            order by hold_until
  loop
    v_errors := private.social_revalidate(c.candidate_id);
    if jsonb_array_length(v_errors) > 0 then
      -- No longer true: a newer candidate will replace it. Not a fault.
      update public.social_post_candidates set validation_status = 'stale', validation_errors = v_errors, validated_at = now(), updated_at = now()
       where candidate_id = c.candidate_id;
      perform private.social_audit('auto_stale', c.candidate_id, null, jsonb_build_object('errors', v_errors));
      continue;
    end if;
    v_url := exists (select 1 from unnest(private.social_posts(c)) p where public.social_has_url(p));
    v_limits := private.social_limit_reasons(private.social_cost(c), v_url);
    if jsonb_array_length(v_limits) > 0 then
      return jsonb_build_object('status', 'waiting', 'candidate_id', c.candidate_id, 'reasons', v_limits, 'queued', v_queued, 'notified', v_notified);
    end if;
    perform net.http_post(
      url := 'https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1/x-publish',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-social-token', (select token from private.social_worker)),
      body := jsonb_build_object('candidate_id', c.candidate_id, 'mode', 'live'),
      timeout_milliseconds := 120000);
    perform private.social_audit('auto_publish_sent', c.candidate_id, null, '{}'::jsonb);
    return jsonb_build_object('status', 'sent', 'candidate_id', c.candidate_id, 'queued', v_queued, 'notified', v_notified);
  end loop;
  return jsonb_build_object('status', 'nothing due', 'queued', v_queued, 'notified', v_notified);
end;
$$;
revoke all on function public.social_auto_tick() from public, anon;
grant execute on function public.social_auto_tick() to authenticated, service_role;

-- ============================================================================
-- Detectors: add the two new ones, then queue
-- ============================================================================
create or replace function public.social_run_detectors(p_triggered_by text default 'schedule')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_run bigint; v_res jsonb := '{}'; v_one jsonb; v_created integer := 0; d text; v_pr bigint; v_queued integer;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'admin only'; end if;
  if not (select detector_enabled from public.social_settings) then
    return jsonb_build_object('status', 'disabled');
  end if;
  insert into public.social_detector_runs (triggered_by) values (coalesce(p_triggered_by, 'schedule')) returning run_id into v_run;
  insert into public.pipeline_runs (job_name, started_at, status) values ('social_detect', now(), 'running') returning run_id into v_pr;

  foreach d in array array['captaincy', 'xg_change', 'accuracy', 'streaks', 'price_changes', 'gameweek_threads'] loop
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
  v_queued := private.social_auto_queue();

  update public.social_detector_runs set finished_at = now(), results = v_res || jsonb_build_object('auto_queued', v_queued),
         candidates_created = v_created where run_id = v_run;
  update public.pipeline_runs set finished_at = now(),
         status = case when exists (select 1 from jsonb_each(v_res) e where e.value->>'status' = 'error') then 'failed' else 'success' end,
         summary = format('%s candidate(s), %s queued automatically; %s', v_created, v_queued,
                          (select string_agg(e.key || ' ' || (e.value->>'status'), ', ') from jsonb_each(v_res) e))
   where run_id = v_pr;
  return jsonb_build_object('run_id', v_run, 'candidates_created', v_created, 'auto_queued', v_queued, 'results', v_res);
end;
$$;

-- ============================================================================
-- Admin: hold / release, settings (automatic switches now allowed)
-- ============================================================================
create or replace function public.social_hold(p_candidate_id bigint, p_hold boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.social_post_candidates set held = p_hold,
         hold_until = case when not p_hold and hold_until < now() then now() else hold_until end, updated_at = now()
   where candidate_id = p_candidate_id and publication_status in ('unpublished', 'failed');
  if not found then raise exception 'candidate % cannot be held (already posted?)', p_candidate_id; end if;
  perform private.social_audit(case when p_hold then 'hold' else 'release' end, p_candidate_id, auth.uid(), '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.social_hold(bigint, boolean) from public, anon;
grant execute on function public.social_hold(bigint, boolean) to authenticated;

create or replace function public.social_update_settings(p jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; k text;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('kill_switch', 'live_enabled', 'detector_enabled', 'max_posts_per_day', 'max_posts_per_month',
                 'min_minutes_between_posts', 'monthly_budget_usd', 'allow_urls', 'auto_publish_enabled',
                 'hold_minutes', 'max_links_per_week', 'auto_post_types', 'reset_breaker') then
      raise exception 'setting % cannot be changed here', k;
    end if;
  end loop;
  select to_jsonb(s) into v_before from public.social_settings s;
  update public.social_settings set
    kill_switch = coalesce((p->>'kill_switch')::boolean, kill_switch),
    live_enabled = coalesce((p->>'live_enabled')::boolean, live_enabled),
    auto_publish_enabled = coalesce((p->>'auto_publish_enabled')::boolean, auto_publish_enabled),
    detector_enabled = coalesce((p->>'detector_enabled')::boolean, detector_enabled),
    max_posts_per_day = coalesce((p->>'max_posts_per_day')::int, max_posts_per_day),
    max_posts_per_month = coalesce((p->>'max_posts_per_month')::int, max_posts_per_month),
    min_minutes_between_posts = coalesce((p->>'min_minutes_between_posts')::int, min_minutes_between_posts),
    monthly_budget_usd = coalesce((p->>'monthly_budget_usd')::numeric, monthly_budget_usd),
    allow_urls = coalesce((p->>'allow_urls')::boolean, allow_urls),
    hold_minutes = coalesce((p->>'hold_minutes')::int, hold_minutes),
    max_links_per_week = coalesce((p->>'max_links_per_week')::int, max_links_per_week),
    auto_post_types = case when p ? 'auto_post_types' then array(select jsonb_array_elements_text(p->'auto_post_types')) else auto_post_types end,
    breaker_tripped_at = case when coalesce((p->>'reset_breaker')::boolean, false) then null else breaker_tripped_at end,
    breaker_reason = case when coalesce((p->>'reset_breaker')::boolean, false) then null else breaker_reason end,
    updated_at = now(), updated_by = auth.uid()
  where id;
  perform private.social_audit('settings', null, auth.uid(), jsonb_build_object('before', v_before, 'change', p));
  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================================
-- Schedule and monitoring
-- ============================================================================
select cron.unschedule('social-auto-tick') where exists (select 1 from cron.job where jobname = 'social-auto-tick');
select cron.schedule('social-auto-tick', '*/10 * * * *', $$select public.social_auto_tick()$$);

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, output_check, notes)
values ('social-auto-tick', 'social', 'supabase_cron', '*/10 * * * *', '30 minutes', '5 minutes', 'pg_cron', '^social-auto-tick$', 'X API',
        null, 'Posts due automatic social candidates to X through x-publish; emails via social-notify')
on conflict (job_key) do nothing;

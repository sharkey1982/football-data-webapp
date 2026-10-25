-- ============================================================================
-- X posts beyond FPL (Chris, 25 Oct 2026; "FixtureShark Posting Plan", the
-- "Proposed next" section). New automatic posts:
--   * match_predictions: match-day morning, FixtureShark's expected goals for
--     each Premier League game and the UK channel (only when confirmed).
--   * quiz / quiz_answer: one a week (Wednesday 12:00, not a match day); the
--     answer is a reply to the question at 18:00.
--   * fact: "Did you know", Tuesday and Thursday 11:00 on non-match days.
-- And the weekly prediction-accuracy post is rewritten in plain terms (right
-- results, best call, biggest surprise, season so far). Its gate on the whole
-- integrity run (which fails on unrelated checks: tennis, credentials,
-- League One fixtures) becomes a check on this gameweek's own predictions:
-- each from an accepted fit made before kick-off.
-- Quiz questions and facts come only from this season's Premier League
-- results and FPL data, worked out when made; a tie means no question.
-- ============================================================================

alter table public.social_post_candidates drop constraint if exists social_post_candidates_post_type_check;
alter table public.social_post_candidates add constraint social_post_candidates_post_type_check
  check (post_type in ('fpl_captaincy', 'team_xg_change', 'prediction_accuracy', 'historical_insight', 'announcement',
                       'fpl_price_changes', 'gameweek_thread', 'fpl_availability', 'fpl_market', 'fpl_week_changes', 'gameweek_outlook',
                       'fixture_moved', 'match_predictions', 'quiz', 'quiz_answer', 'fact'));

update public.social_settings
   set auto_post_types = (select array_agg(distinct t order by t) from unnest(auto_post_types || array['match_predictions', 'quiz', 'quiz_answer', 'fact']) t),
       updated_at = now()
 where id;

-- Home win / draw / away win from two expected-goals figures (independent Poisson, 0-10 goals).
create or replace function private.social_result_probs(p_lh numeric, p_la numeric)
returns jsonb language sql immutable as $$
  with g as (select generate_series(0, 10) k),
  p as (select h.k hk, a.k ak, exp(-p_lh) * power(p_lh, h.k) / factorial(h.k) * exp(-p_la) * power(p_la, a.k) / factorial(a.k) pr
          from g h, g a)
  select jsonb_build_object('home', sum(pr) filter (where hk > ak), 'draw', sum(pr) filter (where hk = ak), 'away', sum(pr) filter (where hk < ak))
    from p;
$$;

-- This season's Premier League table, from confirmed results.
create or replace function private.social_pl_table(p_season bigint)
returns table (team_id bigint, team text, played int, won int, drawn int, lost int, gf int, ga int, pts int,
               home_pts int, away_pts int, clean_sheets int, unbeaten_run int, winless_run int)
language sql stable security definer set search_path = public, pg_temp as $$
  with r as (
    select m.match_date, m.home_team_id team_id, true home, m.full_time_home_goals gf, m.full_time_away_goals ga
      from public.matches m where m.league_id = 1 and m.season_id = p_season and m.full_time_result is not null
    union all
    select m.match_date, m.away_team_id, false, m.full_time_away_goals, m.full_time_home_goals
      from public.matches m where m.league_id = 1 and m.season_id = p_season and m.full_time_result is not null),
  o as (select r.*, case when gf > ga then 3 when gf = ga then 1 else 0 end pts,
               row_number() over (partition by r.team_id order by match_date desc) rn from r),
  runs as (select team_id,
                  coalesce(min(rn) filter (where gf < ga) - 1, count(*)) unbeaten,
                  coalesce(min(rn) filter (where gf > ga) - 1, count(*)) winless
             from o group by team_id)
  select o.team_id, coalesce(ft.name, t.display_name), count(*)::int, count(*) filter (where o.pts = 3)::int, count(*) filter (where o.pts = 1)::int,
         count(*) filter (where o.pts = 0)::int, sum(o.gf)::int, sum(o.ga)::int, sum(o.pts)::int,
         coalesce(sum(o.pts) filter (where o.home), 0)::int, coalesce(sum(o.pts) filter (where not o.home), 0)::int,
         count(*) filter (where o.ga = 0)::int, max(runs.unbeaten)::int, max(runs.winless)::int
    from o join runs using (team_id) join public.teams t on t.team_id = o.team_id
    left join public.fpl_teams ft on ft.season_id = p_season and ft.canonical_team_id = o.team_id
   group by o.team_id, ft.name, t.display_name;
$$;

-- Quiz questions and facts. One row per template that has a single clear answer
-- today (ties give no row). key identifies the template, so a question isn't
-- repeated within four weeks.
create or replace function private.social_pl_facts(p_season bigint)
returns table (key text, question text, answer text, fact text, value text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare n_played int; r record; r2 record;
begin
  select min(played) into n_played from private.social_pl_table(p_season);
  if coalesce(n_played, 0) < 5 then return; end if;

  -- Most clean sheets.
  select * into r from private.social_pl_table(p_season) order by clean_sheets desc, team limit 1;
  select * into r2 from private.social_pl_table(p_season) order by clean_sheets desc, team offset 1 limit 1;
  if r.clean_sheets > r2.clean_sheets then
    key := 'most_clean_sheets'; value := r.team || ':' || r.clean_sheets;
    question := 'Which Premier League side has kept the most clean sheets this season?';
    answer := format('%s, with %s in %s games.', r.team, r.clean_sheets, r.played);
    fact := format('%s have kept %s clean sheets in %s Premier League games this season, more than any other side.', r.team, r.clean_sheets, r.played);
    return next;
  end if;
  -- Longest unbeaten league run right now (4+ games).
  select * into r from private.social_pl_table(p_season) order by unbeaten_run desc, team limit 1;
  select * into r2 from private.social_pl_table(p_season) order by unbeaten_run desc, team offset 1 limit 1;
  if r.unbeaten_run >= 4 and r.unbeaten_run > r2.unbeaten_run then
    key := 'longest_unbeaten'; value := r.team || ':' || r.unbeaten_run;
    question := 'Which Premier League club is on the longest unbeaten league run right now?';
    answer := format('%s: %s league games without defeat.', r.team, r.unbeaten_run);
    fact := format('%s are unbeaten in their last %s Premier League games, the longest run in the league right now.', r.team, r.unbeaten_run);
    return next;
  end if;
  -- Most home points.
  select * into r from private.social_pl_table(p_season) order by home_pts desc, team limit 1;
  select * into r2 from private.social_pl_table(p_season) order by home_pts desc, team offset 1 limit 1;
  if r.home_pts > r2.home_pts then
    key := 'most_home_points'; value := r.team || ':' || r.home_pts;
    question := 'Which club has taken the most points at home in the Premier League this season?';
    answer := format('%s, with %s home points.', r.team, r.home_pts);
    fact := format('%s have taken %s points at home this season, the most in the Premier League.', r.team, r.home_pts);
    return next;
  end if;
  -- Most away points.
  select * into r from private.social_pl_table(p_season) order by away_pts desc, team limit 1;
  select * into r2 from private.social_pl_table(p_season) order by away_pts desc, team offset 1 limit 1;
  if r.away_pts > r2.away_pts then
    key := 'most_away_points'; value := r.team || ':' || r.away_pts;
    question := 'Which club has taken the most points away from home in the Premier League this season?';
    answer := format('%s, with %s away points.', r.team, r.away_pts);
    fact := format('%s have taken %s points away from home this season, the most in the Premier League.', r.team, r.away_pts);
    return next;
  end if;
  -- Most goals scored.
  select * into r from private.social_pl_table(p_season) order by gf desc, team limit 1;
  select * into r2 from private.social_pl_table(p_season) order by gf desc, team offset 1 limit 1;
  if r.gf > r2.gf then
    key := 'most_goals'; value := r.team || ':' || r.gf;
    question := 'Which Premier League side has scored the most league goals this season?';
    answer := format('%s, with %s in %s games.', r.team, r.gf, r.played);
    fact := format('%s have scored %s Premier League goals in %s games this season, more than anyone else.', r.team, r.gf, r.played);
    return next;
  end if;
  -- FPL: most points for a player priced under £6.0m.
  select pl.web_name, coalesce(ft.name, '') team, pl.now_cost, pl.total_points into r
    from public.fpl_players pl left join public.fpl_teams ft on ft.season_id = pl.season_id and ft.fpl_team_id = pl.fpl_team_id
   where pl.season_id = p_season and pl.now_cost < 60 order by pl.total_points desc, pl.fpl_player_id limit 1;
  select pl.total_points into r2 from public.fpl_players pl where pl.season_id = p_season and pl.now_cost < 60
   order by pl.total_points desc, pl.fpl_player_id offset 1 limit 1;
  if r.total_points > r2.total_points then
    key := 'fpl_top_under_6m'; value := r.web_name || ':' || r.total_points;
    question := 'Which FPL player priced under £6.0m has scored the most points this season?';
    answer := format('%s (%s, £%sm): %s points.', r.web_name, r.team, private.social_fmt(r.now_cost / 10.0, 1), r.total_points);
    fact := format('%s (%s) has %s FPL points this season at £%sm, the most of any player under £6.0m.', r.web_name, r.team, r.total_points,
                   private.social_fmt(r.now_cost / 10.0, 1));
    return next;
  end if;
  -- FPL: top-scoring defender.
  select pl.web_name, coalesce(ft.name, '') team, pl.now_cost, pl.total_points into r
    from public.fpl_players pl left join public.fpl_teams ft on ft.season_id = pl.season_id and ft.fpl_team_id = pl.fpl_team_id
   where pl.season_id = p_season and pl.element_type = 2 order by pl.total_points desc, pl.fpl_player_id limit 1;
  select pl.total_points into r2 from public.fpl_players pl where pl.season_id = p_season and pl.element_type = 2
   order by pl.total_points desc, pl.fpl_player_id offset 1 limit 1;
  if r.total_points > r2.total_points then
    key := 'fpl_top_defender'; value := r.web_name || ':' || r.total_points;
    question := 'Which defender has scored the most FPL points this season?';
    answer := format('%s (%s, £%sm): %s points.', r.web_name, r.team, private.social_fmt(r.now_cost / 10.0, 1), r.total_points);
    fact := format('%s (%s) is FPL''s top-scoring defender this season with %s points.', r.web_name, r.team, r.total_points);
    return next;
  end if;
end;
$$;

-- Whether today (UK) has a Premier League fixture.
create or replace function private.social_pl_match_day(p_day date)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.fixtures where league_id = 1 and kickoff_date = p_day and status in ('scheduled', 'played', 'awaiting_result'));
$$;

-- ============================================================================
-- Match-day predictions and where to watch
-- ============================================================================
create or replace function private.social_detect_match_predictions(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_now timestamp := now() at time zone 'Europe/London';
  v_today date := (now() at time zone 'Europe/London')::date;
  v_key text; v_rows jsonb; v_first timestamp; v_bad integer; v_lines text[] := '{}'; v_posts text[]; v_chunk text; v_line text;
  r jsonb; v_id bigint; v_header text; v_post_after timestamp;
begin
  if extract(hour from v_now) < 7 then return jsonb_build_object('status', 'none', 'reason', 'made from 07:00 on match days'); end if;
  v_key := format('match_predictions:%s:%s', v_season, v_today);
  if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
    return jsonb_build_object('status', 'none', 'reason', 'already made today');
  end if;
  select min(kickoff_date + kickoff_time) into v_first from public.fixtures
   where league_id = 1 and kickoff_date = v_today and status = 'scheduled' and kickoff_time is not null;
  if v_first is null then return jsonb_build_object('status', 'none', 'reason', 'no Premier League game today'); end if;
  if v_first < v_now + interval '45 minutes' then return jsonb_build_object('status', 'none', 'reason', 'too close to kick-off'); end if;

  with fx as (
    select f.fixture_id, f.kickoff_time, coalesce(th.name, h.display_name) home, coalesce(ta.name, a.display_name) away,
           f.predicted_home_goals::numeric lh, f.predicted_away_goals::numeric la, f.prediction_fit_run_id fit, r.status fit_status, r.fitted_at,
           (select case when b.status = 'confirmed_not_televised' then 'not on UK TV'
                        when b.status = 'confirmed_broadcast' and b.confidence like 'confirmed%' then b.broadcaster end
              from public.fixture_broadcasts b where b.fixture_id = f.fixture_id and b.market = 'GB'
             order by (b.status = 'confirmed_broadcast') desc, b.broadcast_id limit 1) channel
      from public.fixtures f
      join public.teams h on h.team_id = f.home_team_id join public.teams a on a.team_id = f.away_team_id
      left join public.fpl_teams th on th.season_id = v_season and th.canonical_team_id = f.home_team_id
      left join public.fpl_teams ta on ta.season_id = v_season and ta.canonical_team_id = f.away_team_id
      left join public.model_fit_runs r on r.fit_run_id = f.prediction_fit_run_id
     where f.league_id = 1 and f.kickoff_date = v_today and f.status = 'scheduled')
  select coalesce(jsonb_agg(to_jsonb(fx) order by fx.kickoff_time, fx.home), '[]'),
         count(*) filter (where lh is null or la is null or fit_status is distinct from 'accepted')
    into v_rows, v_bad from fx;
  if v_bad > 0 then
    return jsonb_build_object('status', 'rejected', 'checks', jsonb_build_array(private.social_check(
      'every game predicted from an accepted fit', false, jsonb_build_object('missing_or_unaccepted', v_bad))));
  end if;

  for r in select e from jsonb_array_elements(v_rows) e loop
    v_line := format('%s %s %s–%s %s%s', to_char((r->>'kickoff_time')::time, 'HH24:MI'), r->>'home',
                     private.social_fmt((r->>'lh')::numeric, 1), private.social_fmt((r->>'la')::numeric, 1), r->>'away',
                     coalesce(' · ' || (r->>'channel'), ''));
    v_lines := v_lines || v_line;
  end loop;
  v_header := format('Premier League %s: FixtureShark predictions (expected goals)%s',
                     case when jsonb_array_length(v_rows) = 1 then 'tonight' else 'today' end,
                     case when exists (select 1 from jsonb_array_elements(v_rows) e where e->>'channel' is not null) then ' and where to watch' else '' end);
  if public.social_weighted_length(v_header || E'\n' || array_to_string(v_lines, E'\n')) <= 280 then
    v_posts := array[v_header || E'\n' || array_to_string(v_lines, E'\n')];
  else
    v_posts := array[v_header || ' 🧵'];
    v_chunk := '';
    foreach v_line in array v_lines loop
      if v_chunk <> '' and public.social_weighted_length(v_chunk || E'\n' || v_line) > 280 then
        v_posts := v_posts || v_chunk; v_chunk := v_line;
      else
        v_chunk := case when v_chunk = '' then v_line else v_chunk || E'\n' || v_line end;
      end if;
    end loop;
    if v_chunk <> '' then v_posts := v_posts || v_chunk; end if;
  end if;
  if exists (select 1 from unnest(v_posts) p where public.social_weighted_length(p) > 280) then
    return jsonb_build_object('status', 'rejected', 'reason', 'a post is over 280 characters');
  end if;

  -- 10:00, or two hours before the first kick-off if that is earlier (never before 08:00).
  v_post_after := greatest(v_today + time '08:00', least(v_today + time '10:00', v_first - interval '2 hours'));
  insert into public.social_post_candidates (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('match_predictions', array_to_string(v_posts, E'\n\n'), array_to_string(v_posts, E'\n\n'),
          case when array_length(v_posts, 1) > 1 then to_jsonb(v_posts) end,
          jsonb_build_object('season_id', v_season, 'date', v_today, 'fixtures', v_rows,
                             'post_after', v_post_after at time zone 'Europe/London'),
          now(), v_key, (v_first - interval '5 minutes') at time zone 'Europe/London', 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'match_predictions', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'games', jsonb_array_length(v_rows));
end;
$$;

-- ============================================================================
-- Quiz (weekly) and facts
-- ============================================================================
create or replace function private.social_detect_quiz(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_now timestamp := now() at time zone 'Europe/London';
  v_today date := (now() at time zone 'Europe/London')::date;
  q record; v_key text; v_text text; v_id bigint; v_out jsonb := '[]'; c record;
begin
  -- The answer: a reply to a posted question, at 18:00 that day.
  for c in select qc.* from public.social_post_candidates qc
            where qc.post_type = 'quiz' and qc.publication_status = 'published' and jsonb_typeof(qc.x_post_ids) = 'array'
              and qc.created_at > now() - interval '2 days'
              and not exists (select 1 from public.social_post_candidates a where a.post_type = 'quiz_answer'
                                and (a.source_data->>'question_id')::bigint = qc.candidate_id)
  loop
    v_text := 'Answer: ' || (c.source_data->>'answer');
    insert into public.social_post_candidates (post_type, text, generated_text, source_data, snapshot_at, dedupe_key,
                                               expires_at, validation_status, validation_errors, detector_run_id)
    values ('quiz_answer', v_text, v_text,
            jsonb_build_object('season_id', v_season, 'question_id', c.candidate_id, 'key', c.source_data->>'key',
                               'reply_to_x_id', c.x_post_ids->>0,
                               'post_after', ((c.created_at at time zone 'Europe/London')::date + time '18:00') at time zone 'Europe/London'),
            now(), format('quiz_answer:%s', c.candidate_id),
            ((c.created_at at time zone 'Europe/London')::date + time '23:30') at time zone 'Europe/London', 'passed', '[]', p_run_id)
    returning candidate_id into v_id;
    perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'quiz_answer', 'run_id', p_run_id));
    v_out := v_out || jsonb_build_object('kind', 'answer', 'status', 'created', 'candidate_id', v_id);
  end loop;

  -- The question: Wednesday, made 09:00-11:59, posts 12:00; not on a match day.
  if extract(isodow from v_now) = 3 and extract(hour from v_now) between 9 and 11 and not private.social_pl_match_day(v_today) then
    v_key := format('quiz:%s:%s', v_season, v_today);
    if not exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
      select f.* into q from private.social_pl_facts(v_season) f
       where not exists (select 1 from public.social_post_candidates p where p.post_type in ('quiz', 'fact')
                           and p.source_data->>'key' = f.key and p.created_at > now() - interval '28 days')
       order by md5(f.key || v_today::text) limit 1;
      if q.key is not null then
        v_text := format(E'FixtureShark quiz: %s\nAnswer at 6pm 👇', q.question);
        insert into public.social_post_candidates (post_type, text, generated_text, source_data, snapshot_at, dedupe_key,
                                                   expires_at, validation_status, validation_errors, detector_run_id)
        values ('quiz', v_text, v_text,
                jsonb_build_object('season_id', v_season, 'key', q.key, 'answer', q.answer, 'value', q.value,
                                   'post_after', (v_today + time '12:00') at time zone 'Europe/London'),
                now(), v_key, (v_today + time '16:00') at time zone 'Europe/London', 'passed', '[]', p_run_id)
        returning candidate_id into v_id;
        perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'quiz', 'run_id', p_run_id));
        v_out := v_out || jsonb_build_object('kind', 'question', 'status', 'created', 'candidate_id', v_id, 'key', q.key);
      else
        v_out := v_out || jsonb_build_object('kind', 'question', 'status', 'none', 'reason', 'no unused question with a single answer');
      end if;
    end if;
  end if;
  return jsonb_build_object('status', case when exists (select 1 from jsonb_array_elements(v_out) e where e->>'status' = 'created') then 'created' else 'none' end,
                            'items', v_out);
end;
$$;

create or replace function private.social_detect_fact(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_now timestamp := now() at time zone 'Europe/London';
  v_today date := (now() at time zone 'Europe/London')::date;
  q record; v_key text; v_text text; v_id bigint;
begin
  if extract(isodow from v_now) not in (2, 4) or extract(hour from v_now) not between 8 and 10 then
    return jsonb_build_object('status', 'none', 'reason', 'facts are made Tuesday and Thursday mornings');
  end if;
  if private.social_pl_match_day(v_today) then return jsonb_build_object('status', 'none', 'reason', 'Premier League match day'); end if;
  v_key := format('fact:%s:%s', v_season, v_today);
  if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
    return jsonb_build_object('status', 'none', 'reason', 'already made today');
  end if;
  select f.* into q from private.social_pl_facts(v_season) f
   where not exists (select 1 from public.social_post_candidates p where p.post_type in ('quiz', 'fact')
                       and p.source_data->>'key' = f.key and p.created_at > now() - interval '28 days')
   order by md5(f.key || v_today::text) limit 1;
  if q.key is null then return jsonb_build_object('status', 'none', 'reason', 'no unused fact with a single answer'); end if;
  v_text := 'Did you know? ' || q.fact;
  insert into public.social_post_candidates (post_type, text, generated_text, source_data, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('fact', v_text, v_text,
          jsonb_build_object('season_id', v_season, 'key', q.key, 'value', q.value,
                             'post_after', (v_today + time '11:00') at time zone 'Europe/London'),
          now(), v_key, (v_today + time '21:00') at time zone 'Europe/London', 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'fact', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'key', q.key);
end;
$$;

-- ============================================================================
-- Weekly prediction accuracy, in plain terms
-- ============================================================================
create or replace function private.social_detect_accuracy(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_gw integer; v_checks jsonb := '[]'; v_ok boolean;
  v_fix integer; v_res integer; v_sc integer; v_versions text[]; v_nomkt integer; v_late integer;
  v_hits integer; v_mhits integer; v_ids bigint[]; v_best record; v_worst record; v_shits integer; v_sn integer;
  v_key text; v_text text; v_id bigint; v_last_kick timestamptz;
begin
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
  -- Point in time, for these matches only (25 Oct 2026; was: the whole integrity run did not fail).
  select count(*) into v_late
    from public.model_scorecard_matches s join public.matches m using (match_id)
    left join public.model_fit_runs r on r.fit_run_id = s.fit_run_id
   where s.match_id = any(coalesce(v_ids, '{}'))
     and (r.status is distinct from 'accepted'
          or r.fitted_at >= ((m.match_date + coalesce(m.kickoff_time, time '00:00')) at time zone 'Europe/London'));
  v_checks := v_checks || private.social_check('each prediction from an accepted fit made before kick-off', v_late = 0,
                                               jsonb_build_object('late_or_unaccepted', v_late));
  v_checks := v_checks || private.social_check('scorecard refreshed after the last kick-off',
      (select max(finished_at) from public.pipeline_runs where job_name ilike '%scorecard%' and status = 'success') > v_last_kick
      or exists (select 1 from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                  where j.jobname = 'refresh-model-scorecard' and d.status = 'succeeded' and d.end_time > v_last_kick + interval '2 hours'),
      null);

  select bool_and((x->>'ok')::boolean) into v_ok from jsonb_array_elements(v_checks) x;
  if not v_ok then return jsonb_build_object('status', 'rejected', 'gw', v_gw, 'checks', v_checks); end if;

  with sm as (
    select s.*, coalesce(th.name, h.display_name) home, coalesce(ta.name, a.display_name) away,
           case s.result when 'H' then s.p_home when 'D' then s.p_draw else s.p_away end p_actual,
           s.result = case when s.p_home >= greatest(s.p_draw, s.p_away) then 'H' when s.p_away >= s.p_draw then 'A' else 'D' end hit,
           s.result = case when s.m_home >= greatest(s.m_draw, s.m_away) then 'H' when s.m_away >= s.m_draw then 'A' else 'D' end mhit
      from public.model_scorecard_matches s join public.matches m using (match_id)
      join public.teams h on h.team_id = m.home_team_id join public.teams a on a.team_id = m.away_team_id
      left join public.fpl_teams th on th.season_id = v_season and th.canonical_team_id = m.home_team_id
      left join public.fpl_teams ta on ta.season_id = v_season and ta.canonical_team_id = m.away_team_id
     where s.match_id = any(v_ids))
  select count(*) filter (where hit), count(*) filter (where mhit) into v_hits, v_mhits from sm;
  select coalesce(th.name, h.display_name) home, coalesce(ta.name, a.display_name) away, s.hg, s.ag,
         case s.result when 'H' then s.p_home when 'D' then s.p_draw else s.p_away end p_actual
    into v_best
    from public.model_scorecard_matches s join public.matches m using (match_id)
    join public.teams h on h.team_id = m.home_team_id join public.teams a on a.team_id = m.away_team_id
    left join public.fpl_teams th on th.season_id = v_season and th.canonical_team_id = m.home_team_id
    left join public.fpl_teams ta on ta.season_id = v_season and ta.canonical_team_id = m.away_team_id
   where s.match_id = any(v_ids) order by 5 desc, s.match_id limit 1;
  select coalesce(th.name, h.display_name) home, coalesce(ta.name, a.display_name) away, s.hg, s.ag,
         case s.result when 'H' then s.p_home when 'D' then s.p_draw else s.p_away end p_actual
    into v_worst
    from public.model_scorecard_matches s join public.matches m using (match_id)
    join public.teams h on h.team_id = m.home_team_id join public.teams a on a.team_id = m.away_team_id
    left join public.fpl_teams th on th.season_id = v_season and th.canonical_team_id = m.home_team_id
    left join public.fpl_teams ta on ta.season_id = v_season and ta.canonical_team_id = m.away_team_id
   where s.match_id = any(v_ids) order by 5 asc, s.match_id limit 1;
  select count(*) filter (where s.result = case when s.p_home >= greatest(s.p_draw, s.p_away) then 'H' when s.p_away >= s.p_draw then 'A' else 'D' end),
         count(*)
    into v_shits, v_sn
    from public.model_scorecard_matches s join public.matches m using (match_id)
   where m.league_id = 1 and m.season_id = v_season;

  v_key := v_key || ':' || v_versions[1] || ':t2';
  v_text := format(E'How FixtureShark''s predictions did in GW%s\nRight result: %s of %s (the betting favourite: %s of %s)\nBest call: %s %s-%s %s, %s%% for that result\nBiggest surprise: %s %s-%s %s, %s%%\nSeason so far: %s of %s right (%s%%)',
                   v_gw, v_hits, v_sc, v_mhits, v_sc,
                   v_best.home, v_best.hg, v_best.ag, v_best.away, round(v_best.p_actual * 100),
                   v_worst.home, v_worst.hg, v_worst.ag, v_worst.away, round(v_worst.p_actual * 100),
                   v_shits, v_sn, round(100.0 * v_shits / nullif(v_sn, 0)));
  if public.social_weighted_length(v_text) > 280 then
    return jsonb_build_object('status', 'rejected', 'reason', 'over 280 characters', 'text', v_text);
  end if;

  insert into public.social_post_candidates (post_type, text, generated_text, source_data, model_version, snapshot_at, dedupe_key,
                                             expires_at, validation_status, detector_run_id)
  values ('prediction_accuracy', v_text, v_text,
          jsonb_build_object('season_id', v_season, 'gw', v_gw, 'match_ids', to_jsonb(v_ids), 'n', v_sc, 'hits', v_hits, 'market_hits', v_mhits,
                             'season_hits', v_shits, 'season_n', v_sn, 'model_version', v_versions[1], 'checks', v_checks),
          v_versions[1], now(), v_key, now() + interval '3 days', 'passed', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'prediction_accuracy', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'gw', v_gw, 'checks', v_checks);
end;
$$;

-- ============================================================================
-- Wiring: revalidation and the detector list (string replacements on the live
-- definitions; re-running skips what is already applied)
-- ============================================================================
create or replace function pg_temp.social_patch(p_sig text, p_old text, p_new text) returns void language plpgsql as $f$
declare d text; n integer;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_new in d) > 0 then return; end if;
  n := (length(d) - length(replace(d, p_old, ''))) / length(p_old);
  if n <> 1 then raise exception 'social_patch: % anchor found % times: %', p_sig, n, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end;
$f$;

select pg_temp.social_patch('private.social_revalidate(bigint)', $o$
  end if;
  return e;
end;$o$, $n$

  elsif c.post_type = 'match_predictions' then
    -- Same kick-offs and the same predictions (to one decimal place).
    select count(*) into v_n from jsonb_array_elements(s->'fixtures') t
      left join public.fixtures f on f.fixture_id = (t->>'fixture_id')::bigint
     where f.fixture_id is null or f.status <> 'scheduled' or f.kickoff_time is distinct from (t->>'kickoff_time')::time
        or round(f.predicted_home_goals::numeric, 1) <> round((t->>'lh')::numeric, 1)
        or round(f.predicted_away_goals::numeric, 1) <> round((t->>'la')::numeric, 1);
    if v_n > 0 then e := e || to_jsonb(format('%s game(s) changed time or prediction', v_n)); end if;

  elsif c.post_type in ('quiz', 'fact') then
    if not exists (select 1 from private.social_pl_facts((s->>'season_id')::bigint) f where f.key = s->>'key' and f.value = s->>'value') then
      e := e || to_jsonb('the answer has changed'::text);
    end if;
  end if;
  return e;
end;$n$);

select pg_temp.social_patch('public.social_run_detectors(text)', $o$'outlook', 'fixture_moves']$o$,
                            $n$'outlook', 'fixture_moves', 'match_predictions', 'quiz', 'fact']$n$);

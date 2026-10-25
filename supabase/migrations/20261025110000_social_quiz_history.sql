-- ============================================================================
-- Quiz from history; facts only from up-to-date results (Chris, 25 Oct 2026:
-- "Man City lost yesterday ... make quiz questions more about history and
-- closed seasons").
--   * Quiz questions now come from closed Premier League seasons (1992/93 to
--     last season): most goals, fewest conceded, most draws, most away wins,
--     biggest win. A tie gives no question; a question is never repeated.
--   * "Did you know": Tuesday from history; Thursday from this season, but only
--     when every Premier League game that kicked off 6+ hours ago has its
--     confirmed result (otherwise from history instead).
-- ============================================================================

-- Every Premier League game that kicked off 6+ hours ago has a confirmed result.
create or replace function private.social_pl_results_fresh(p_season bigint)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (
    select 1 from public.fixtures f
     where f.league_id = 1 and f.season_id = p_season and f.status <> 'postponed' and f.kickoff_time is not null
       and ((f.kickoff_date + f.kickoff_time) at time zone 'Europe/London') < now() - interval '6 hours'
       and not exists (select 1 from public.matches m where m.league_id = 1 and m.season_id = f.season_id
                         and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id and m.full_time_result is not null));
$$;

-- Questions and facts about one closed Premier League season.
create or replace function private.social_history_facts(p_start_year int)
returns table (key text, question text, answer text, fact text, value text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_label text; r record; r2 record;
begin
  v_label := p_start_year || '/' || lpad(((p_start_year + 1) % 100)::text, 2, '0');
  if not exists (select 1 from public.seasons s join public.matches m on m.season_id = s.season_id and m.league_id = 1
                  where s.start_year = p_start_year group by s.season_id having count(*) >= 380) then
    return;
  end if;

  for r in
    with g as (
      select m.home_team_id team_id, m.full_time_home_goals gf, m.full_time_away_goals ga, true home
        from public.matches m join public.seasons s using (season_id) where m.league_id = 1 and s.start_year = p_start_year
      union all
      select m.away_team_id, m.full_time_away_goals, m.full_time_home_goals, false
        from public.matches m join public.seasons s using (season_id) where m.league_id = 1 and s.start_year = p_start_year),
    t as (select t.display_name team, sum(gf) gf, sum(ga) ga, count(*) filter (where gf = ga) draws,
                 count(*) filter (where not home and gf > ga) away_wins
            from g join public.teams t on t.team_id = g.team_id group by t.display_name)
    select 'most_goals' tpl, (select team from t order by gf desc limit 1) team, (select gf from t order by gf desc limit 1) n,
           (select count(*) from t where gf = (select max(gf) from t)) ties
    union all select 'fewest_conceded', (select team from t order by ga limit 1), (select ga from t order by ga limit 1),
           (select count(*) from t where ga = (select min(ga) from t))
    union all select 'most_draws', (select team from t order by draws desc limit 1), (select draws from t order by draws desc limit 1),
           (select count(*) from t where draws = (select max(draws) from t))
    union all select 'most_away_wins', (select team from t order by away_wins desc limit 1), (select away_wins from t order by away_wins desc limit 1),
           (select count(*) from t where away_wins = (select max(away_wins) from t))
  loop
    continue when r.ties <> 1;
    key := format('h:%s:%s', r.tpl, p_start_year); value := r.team || ':' || r.n;
    if r.tpl = 'most_goals' then
      question := format('Which club scored the most Premier League goals in %s?', v_label);
      answer := format('%s, with %s.', r.team, r.n);
      fact := format('%s scored %s Premier League goals in %s, more than any other club that season.', r.team, r.n, v_label);
    elsif r.tpl = 'fewest_conceded' then
      question := format('Which club conceded the fewest Premier League goals in %s?', v_label);
      answer := format('%s, with %s.', r.team, r.n);
      fact := format('%s conceded only %s Premier League goals in %s, the fewest that season.', r.team, r.n, v_label);
    elsif r.tpl = 'most_draws' then
      question := format('Which club drew the most Premier League games in %s?', v_label);
      answer := format('%s, with %s draws.', r.team, r.n);
      fact := format('%s drew %s Premier League games in %s, more than any other club.', r.team, r.n, v_label);
    else
      question := format('Which club won the most Premier League away games in %s?', v_label);
      answer := format('%s, with %s away wins.', r.team, r.n);
      fact := format('%s won %s Premier League games away from home in %s, the most that season.', r.team, r.n, v_label);
    end if;
    return next;
  end loop;

  -- Biggest win (by margin, then goals scored); only when one game stands alone.
  select m.match_date, th.display_name home, ta.display_name away, m.full_time_home_goals hg, m.full_time_away_goals ag,
         abs(m.full_time_home_goals - m.full_time_away_goals) margin, greatest(m.full_time_home_goals, m.full_time_away_goals) top
    into r
    from public.matches m join public.seasons s using (season_id)
    join public.teams th on th.team_id = m.home_team_id join public.teams ta on ta.team_id = m.away_team_id
   where m.league_id = 1 and s.start_year = p_start_year
   order by 6 desc, 7 desc limit 1;
  select count(*) n into r2 from public.matches m join public.seasons s using (season_id)
   where m.league_id = 1 and s.start_year = p_start_year
     and abs(m.full_time_home_goals - m.full_time_away_goals) = r.margin
     and greatest(m.full_time_home_goals, m.full_time_away_goals) = r.top;
  if r2.n = 1 and r.margin >= 4 then
    key := format('h:biggest_win:%s', p_start_year); value := format('%s %s-%s %s', r.home, r.hg, r.ag, r.away);
    question := format('What was the biggest win of the %s Premier League season?', v_label);
    answer := format('%s %s-%s %s, on %s.', r.home, r.hg, r.ag, r.away, to_char(r.match_date, 'FMDD FMMonth YYYY'));
    fact := format('The biggest Premier League win of %s was %s %s-%s %s, on %s.', v_label, r.home, r.hg, r.ag, r.away,
                   to_char(r.match_date, 'FMDD FMMonth YYYY'));
    return next;
  end if;
end;
$$;

-- An unused history question or fact, from a season picked by the day.
create or replace function private.social_pick_history(p_day date, p_types text[])
returns table (key text, question text, answer text, fact text, value text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare y int; v_cur int;
begin
  select start_year into v_cur from public.seasons where season_id = public.fpl_current_season_id();
  for y in select g from generate_series(1992, v_cur - 1) g order by md5(g::text || p_day::text) loop
    return query
      select f.* from private.social_history_facts(y) f
       where not exists (select 1 from public.social_post_candidates p
                          where p.post_type = any(p_types) and p.source_data->>'key' = f.key)
       order by md5(f.key || p_day::text) limit 1;
    if found then return; end if;
  end loop;
end;
$$;

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

  -- The question: Wednesday, made 09:00-11:59, posts 12:00; not on a match day. From history.
  if extract(isodow from v_now) = 3 and extract(hour from v_now) between 9 and 11 and not private.social_pl_match_day(v_today) then
    v_key := format('quiz:%s:%s', v_season, v_today);
    if not exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
      select * into q from private.social_pick_history(v_today, array['quiz']);
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
        v_out := v_out || jsonb_build_object('kind', 'question', 'status', 'none', 'reason', 'no unused question');
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
  q record; v_key text; v_text text; v_id bigint; v_from text := 'history';
begin
  if extract(isodow from v_now) not in (2, 4) or extract(hour from v_now) not between 8 and 10 then
    return jsonb_build_object('status', 'none', 'reason', 'facts are made Tuesday and Thursday mornings');
  end if;
  if private.social_pl_match_day(v_today) then return jsonb_build_object('status', 'none', 'reason', 'Premier League match day'); end if;
  v_key := format('fact:%s:%s', v_season, v_today);
  if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
    return jsonb_build_object('status', 'none', 'reason', 'already made today');
  end if;
  -- Thursday: this season, if every recent result is in.
  if extract(isodow from v_now) = 4 and private.social_pl_results_fresh(v_season) then
    select f.* into q from private.social_pl_facts(v_season) f
     where not exists (select 1 from public.social_post_candidates p where p.post_type in ('quiz', 'fact')
                         and p.source_data->>'key' = f.key and p.created_at > now() - interval '28 days')
     order by md5(f.key || v_today::text) limit 1;
    if q.key is not null then v_from := 'this season'; end if;
  end if;
  if q.key is null then
    select * into q from private.social_pick_history(v_today, array['fact']);
  end if;
  if q.key is null then return jsonb_build_object('status', 'none', 'reason', 'no unused fact'); end if;
  v_text := 'Did you know? ' || q.fact;
  insert into public.social_post_candidates (post_type, text, generated_text, source_data, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('fact', v_text, v_text,
          jsonb_build_object('season_id', v_season, 'key', q.key, 'value', q.value, 'from', v_from,
                             'post_after', (v_today + time '11:00') at time zone 'Europe/London'),
          now(), v_key, (v_today + time '21:00') at time zone 'Europe/London', 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'fact', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'key', q.key, 'from', v_from);
end;
$$;

-- Revalidation: a history question can't change; a this-season one needs its
-- answer unchanged and the results up to date.
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
select pg_temp.social_patch('private.social_revalidate(bigint)',
$o$    if not exists (select 1 from private.social_pl_facts((s->>'season_id')::bigint) f where f.key = s->>'key' and f.value = s->>'value') then
      e := e || to_jsonb('the answer has changed'::text);
    end if;$o$,
$n$    if s->>'key' not like 'h:%' then
      if not private.social_pl_results_fresh((s->>'season_id')::bigint) then
        e := e || to_jsonb('recent results not in yet'::text);
      elsif not exists (select 1 from private.social_pl_facts((s->>'season_id')::bigint) f where f.key = s->>'key' and f.value = s->>'value') then
        e := e || to_jsonb('the answer has changed'::text);
      end if;
    end if;$n$);

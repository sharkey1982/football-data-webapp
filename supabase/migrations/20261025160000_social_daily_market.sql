-- ============================================================================
-- Daily market view on X (Chris, 25 Oct 2026): "Rather than do some of this
-- on a gw basis - why don't we do daily", across the English leagues the
-- model predicts (Premier League, Championship, League One, League Two,
-- National League). Replaces the paused prediction-accuracy post.
--
-- One morning thread on any day with games:
--   1. Strong favourites (65%+ in the betting market) and how many games are
--      close calls (no side above 40%).
--   2. Where our model differs most from the market: an observation, never a
--      tip. Games with a team whose rating is a promoted-team estimate are
--      left out (the 19 Oct Spurs v Coventry miss).
--   3. Yesterday: how the strong favourites did and how the biggest
--      difference turned out -- only for a thread we actually posted, and
--      only once every listed result is in.
-- A day with no games but a review to give posts the review alone.
--
-- Not in auto_post_types yet: Chris sees examples first.
-- Also: monthly post limit 120 -> 160 (Chris, 25 Oct 2026).
-- ============================================================================

update public.social_settings set max_posts_per_month = 160, updated_at = now() where id and max_posts_per_month < 160;

alter table public.social_post_candidates drop constraint social_post_candidates_post_type_check;
alter table public.social_post_candidates add constraint social_post_candidates_post_type_check check (post_type = any (array[
  'fpl_captaincy', 'team_xg_change', 'prediction_accuracy', 'historical_insight', 'announcement', 'fpl_price_changes',
  'gameweek_thread', 'fpl_availability', 'fpl_market', 'fpl_week_changes', 'gameweek_outlook', 'fixture_moved',
  'match_predictions', 'quiz', 'quiz_answer', 'fact', 'daily_market']));

create or replace function private.social_league_short(p_league_id bigint) returns text
language sql immutable as $$
  select case p_league_id when 1 then 'PL' when 2 then 'Champ' when 3 then 'L1' when 4 then 'L2' when 5 then 'NL' end
$$;

-- A day's league games with the market's and the model's 1X2 probabilities
-- (model only from an accepted fit, predicted before kick-off) and the
-- result where one is in (confirmed first, then reported).
create or replace function private.social_daily_games(p_day date)
returns table (fixture_id bigint, league_id bigint, lg text, home text, away text, kickoff_time time, status text,
               mh numeric, md numeric, ma numeric, ph numeric, pd numeric, pa numeric, estimated boolean,
               hg integer, ag integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select f.fixture_id, f.league_id, private.social_league_short(f.league_id),
         private.social_team_name(f.home_team_id), private.social_team_name(f.away_team_id), f.kickoff_time, f.status,
         round(m.market_home, 4), round(m.market_draw, 4), round(m.market_away, 4),
         round((p.pr->>'home')::numeric, 4), round((p.pr->>'draw')::numeric, 4), round((p.pr->>'away')::numeric, 4),
         exists (select 1 from public.team_ratings tr where tr.fit_run_id = f.prediction_fit_run_id
                   and tr.team_id in (f.home_team_id, f.away_team_id) and tr.is_estimated),
         coalesce(mt.full_time_home_goals, f.reported_home_goals)::int, coalesce(mt.full_time_away_goals, f.reported_away_goals)::int
    from public.fixtures f
    join public.fixture_market_latest m on m.fixture_id = f.fixture_id
    join public.model_fit_runs r on r.fit_run_id = f.prediction_fit_run_id and r.status = 'accepted'
    cross join lateral (select private.social_result_probs(f.predicted_home_goals::numeric, f.predicted_away_goals::numeric) pr) p
    left join public.matches mt on mt.league_id = f.league_id and mt.season_id = f.season_id
                               and mt.home_team_id = f.home_team_id and mt.away_team_id = f.away_team_id
   where f.kickoff_date = p_day and f.league_id between 1 and 5
     and f.predicted_home_goals is not null and f.predicted_away_goals is not null
     and f.predicted_at < (f.kickoff_date + coalesce(f.kickoff_time, time '12:00')) at time zone 'Europe/London'
$$;

create or replace function private.social_pct(p numeric) returns text language sql immutable as $$
  select round(p * 100)::int || '%'
$$;

create or replace function private.social_detect_daily_market(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_now timestamp := now() at time zone 'Europe/London';
  v_today date := (now() at time zone 'Europe/London')::date;
  v_key text := format('daily_market:%s', (now() at time zone 'Europe/London')::date);
  v_games jsonb; v_n integer; v_first timestamp; v_fav jsonb; v_close integer; v_mis jsonb;
  v_posts text[] := '{}'; v_p text; v_review text; v_prev public.social_post_candidates; v_rev jsonb;
  v_won integer; v_listed integer; v_missing integer; v_id bigint; v_post_after timestamp; v_expires timestamp;
  v_lines text; v_mrow jsonb; v_side text; v_dayname text := trim(to_char((now() at time zone 'Europe/London')::date, 'Day'));
begin
  if extract(hour from v_now) < 7 or extract(hour from v_now) >= 12 then
    return jsonb_build_object('status', 'none', 'reason', 'made 07:00-11:59');
  end if;
  if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
    return jsonb_build_object('status', 'none', 'reason', 'already made today');
  end if;

  -- Today's games still to kick off, more than an hour away.
  select coalesce(jsonb_agg(to_jsonb(g) order by greatest(g.mh, g.ma) desc, g.kickoff_time, g.home), '[]'),
         count(*), min(v_today + g.kickoff_time)
    into v_games, v_n, v_first
    from private.social_daily_games(v_today) g
   where g.status = 'scheduled' and g.kickoff_time is not null and v_today + g.kickoff_time > v_now + interval '60 minutes';

  -- ---- Yesterday's review: only of a thread we posted, once every listed result is in.
  select * into v_prev from public.social_post_candidates
   where dedupe_key = format('daily_market:%s', v_today - 1) and publication_status = 'published';
  if v_prev.candidate_id is not null and jsonb_array_length(coalesce(v_prev.source_data->'favourites', '[]'))
                                         + (case when v_prev.source_data->'mismatch' is null then 0 else 1 end) > 0 then
    select jsonb_object_agg(g.fixture_id::text, to_jsonb(g)) into v_rev from private.social_daily_games(v_today - 1) g;
    select count(*), count(*) filter (where (v_rev->(f->>'fixture_id'))->>'hg' is null),
           count(*) filter (where case f->>'side'
                                    when 'home' then ((v_rev->(f->>'fixture_id'))->>'hg')::int > ((v_rev->(f->>'fixture_id'))->>'ag')::int
                                    else ((v_rev->(f->>'fixture_id'))->>'ag')::int > ((v_rev->(f->>'fixture_id'))->>'hg')::int end)
      into v_listed, v_missing, v_won
      from jsonb_array_elements(coalesce(v_prev.source_data->'favourites', '[]')) f;
    v_mrow := v_prev.source_data->'mismatch';
    if v_mrow is not null and (v_rev->(v_mrow->>'fixture_id'))->>'hg' is null then v_missing := v_missing + 1; end if;
    if v_missing = 0 then
      v_review := 'Yesterday:';
      if v_listed > 0 then
        select v_review || format(E'\nStrong favourites won %s of %s (%s)', v_won, v_listed,
                 string_agg(f->>'team' || case when case f->>'side'
                                    when 'home' then ((v_rev->(f->>'fixture_id'))->>'hg')::int > ((v_rev->(f->>'fixture_id'))->>'ag')::int
                                    else ((v_rev->(f->>'fixture_id'))->>'ag')::int > ((v_rev->(f->>'fixture_id'))->>'hg')::int end
                                 then ' ✓' else ' ✗' end, ', ' order by ord))
          into v_review
          from jsonb_array_elements(v_prev.source_data->'favourites') with ordinality t(f, ord);
      end if;
      if v_mrow is not null then
        v_mrow := v_mrow || jsonb_build_object('hg', (v_rev->(v_mrow->>'fixture_id'))->>'hg', 'ag', (v_rev->(v_mrow->>'fixture_id'))->>'ag');
        v_side := case when (v_mrow->>'hg')::int > (v_mrow->>'ag')::int then 'home' when (v_mrow->>'hg')::int < (v_mrow->>'ag')::int then 'away' else 'draw' end;
        v_review := v_review || format(E'\nBiggest difference, %s v %s: %s-%s. Our model gave %s %s, the market %s.',
          v_mrow->>'home', v_mrow->>'away', v_mrow->>'hg', v_mrow->>'ag',
          case v_side when 'draw' then 'a draw' else 'a ' || (case v_side when 'home' then v_mrow->>'home' else v_mrow->>'away' end) || ' win' end,
          private.social_pct((v_mrow->>('p' || left(v_side, 1)))::numeric), private.social_pct((v_mrow->>('m' || left(v_side, 1)))::numeric));
      end if;
    end if;
  end if;

  if v_n < 3 and v_review is null then
    return jsonb_build_object('status', 'none', 'reason', 'fewer than 3 games with market and model today, and no review due',
                              'games', v_n, 'review_missing_results', v_missing);
  end if;

  if v_n >= 3 then
    -- Strong favourites, top four.
    select coalesce(jsonb_agg(jsonb_build_object('fixture_id', g->>'fixture_id', 'lg', g->>'lg',
                                                 'side', case when (g->>'mh')::numeric >= (g->>'ma')::numeric then 'home' else 'away' end,
                                                 'team', case when (g->>'mh')::numeric >= (g->>'ma')::numeric then g->>'home' else g->>'away' end,
                                                 'opp', case when (g->>'mh')::numeric >= (g->>'ma')::numeric then g->>'away' else g->>'home' end,
                                                 'p', greatest((g->>'mh')::numeric, (g->>'ma')::numeric))
                              order by ord), '[]')
      into v_fav
      from (select g, ord from jsonb_array_elements(v_games) with ordinality t(g, ord)
             where greatest((g->>'mh')::numeric, (g->>'ma')::numeric) >= 0.65 order by ord limit 4) s;
    select count(*) into v_close from jsonb_array_elements(v_games) g where greatest((g->>'mh')::numeric, (g->>'ma')::numeric) < 0.40;

    v_p := format('%s''s English football (%s games) as the betting market sees it 🧵', v_dayname, v_n);
    if jsonb_array_length(v_fav) > 0 then
      select v_p || E'\n\nStrong favourites (65%+):\n' || string_agg(format('%s v %s (%s) %s', f->>'team', f->>'opp', f->>'lg', private.social_pct((f->>'p')::numeric)), E'\n')
        into v_p from jsonb_array_elements(v_fav) f;
    else
      v_p := v_p || E'\n\nNo side is a strong favourite (65%+) today.';
    end if;
    v_p := v_p || case when v_close = 0 then E'\n\nNo game is a coin flip (no side under 40%).'
                       when v_close = 1 then E'\n\n1 game is a coin flip: no side above 40%.'
                       else format(E'\n\n%s games are coin flips: no side above 40%%.', v_close) end;
    v_posts := v_posts || v_p;

    -- Biggest difference between our model and the market (any outcome), teams with real ratings only.
    select g || jsonb_build_object('gap', gap, 'outcome', outcome) into v_mis
      from (select g, o.outcome, abs(o.pm - o.mm) gap
              from jsonb_array_elements(v_games) g
              cross join lateral (values ('home', (g->>'ph')::numeric, (g->>'mh')::numeric),
                                         ('draw', (g->>'pd')::numeric, (g->>'md')::numeric),
                                         ('away', (g->>'pa')::numeric, (g->>'ma')::numeric)) o(outcome, pm, mm)
             where not (g->>'estimated')::boolean) s
     where gap >= 0.10
     order by gap desc, g->>'fixture_id' limit 1;
    if v_mis is not null then
      v_posts := v_posts || format(E'Where our model differs most from the market today:\n%s v %s (%s)\n\n%s\nMarket: %s / %s / %s\nOur model: %s / %s / %s\n\nNot a tip, just where we see it differently. We''ll report back tomorrow.',
        v_mis->>'home', v_mis->>'away', v_mis->>'lg', 'Home / draw / away',
        private.social_pct((v_mis->>'mh')::numeric), private.social_pct((v_mis->>'md')::numeric), private.social_pct((v_mis->>'ma')::numeric),
        private.social_pct((v_mis->>'ph')::numeric), private.social_pct((v_mis->>'pd')::numeric), private.social_pct((v_mis->>'pa')::numeric));
    else
      v_posts := v_posts || 'Our model and the market broadly agree today: no outcome differs by 10 points or more.'::text;
    end if;
  end if;

  if v_review is not null then
    if array_length(v_posts, 1) is null then v_review := replace(v_review, 'Yesterday:', format('%s''s football, how it went:', trim(to_char(v_today - 1, 'Day')))); end if;
    v_posts := v_posts || v_review;
  end if;

  if exists (select 1 from unnest(v_posts) p where public.social_weighted_length(p) > 280) then
    return jsonb_build_object('status', 'rejected', 'reason', 'a post is over 280 characters', 'posts', to_jsonb(v_posts));
  end if;

  -- 09:00, or two hours before the first kick-off if that is earlier (never before 08:00).
  v_post_after := case when v_first is null then v_today + time '09:00'
                       else greatest(v_today + time '08:00', least(v_today + time '09:00', v_first - interval '2 hours')) end;
  v_expires := coalesce(v_first - interval '15 minutes', v_today + time '14:00');
  insert into public.social_post_candidates (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('daily_market', array_to_string(v_posts, E'\n\n'), array_to_string(v_posts, E'\n\n'),
          case when array_length(v_posts, 1) > 1 then to_jsonb(v_posts) end,
          jsonb_build_object('date', v_today, 'games', v_n, 'favourites', coalesce(v_fav, '[]'), 'coin_flips', v_close,
                             'mismatch', v_mis, 'review_of', v_prev.candidate_id, 'review', v_review is not null,
                             'post_after', v_post_after at time zone 'Europe/London'),
          now(), v_key, v_expires at time zone 'Europe/London', 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'daily_market', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'games', v_n, 'review', v_review is not null);
end;
$$;

-- ---- Wiring: run it hourly with the others; still true at posting time.
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

select pg_temp.social_patch('public.social_run_detectors(text)',
  $o$'match_predictions', 'quiz', 'fact']$o$,
  $n$'match_predictions', 'quiz', 'fact', 'daily_market']$n$);

select pg_temp.social_patch('private.social_revalidate(bigint)',
$o$  elsif c.post_type in ('quiz', 'fact') then$o$,
$n$  elsif c.post_type = 'daily_market' then
    -- Every game named still to kick off, and the named difference unchanged (to a point).
    select count(*) into v_n
      from (select (f->>'fixture_id')::bigint id from jsonb_array_elements(coalesce(s->'favourites', '[]')) f
            union select (s->'mismatch'->>'fixture_id')::bigint where s->'mismatch' is not null) t
      left join public.fixtures fx on fx.fixture_id = t.id
     where fx.fixture_id is null or fx.status <> 'scheduled' or fx.kickoff_date is distinct from (s->>'date')::date;
    if v_n > 0 then e := e || to_jsonb(format('%s game(s) no longer scheduled today', v_n)); end if;
    if s->'mismatch' is not null and not exists (
         select 1 from private.social_daily_games((s->>'date')::date) g
          where g.fixture_id = (s->'mismatch'->>'fixture_id')::bigint
            and abs(g.ph - (s->'mismatch'->>'ph')::numeric) < 0.01 and abs(g.ma - (s->'mismatch'->>'ma')::numeric) < 0.01
            and abs(g.mh - (s->'mismatch'->>'mh')::numeric) < 0.01) then
      e := e || to_jsonb('the model or the market has moved on the named game'::text);
    end if;

  elsif c.post_type in ('quiz', 'fact') then$n$);

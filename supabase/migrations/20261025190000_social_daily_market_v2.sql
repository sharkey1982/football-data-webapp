-- ============================================================================
-- Daily market view, second version (Chris, 25 Oct 2026: today's match post
-- was "pretty boring and uninsightful"; agreed strategy: every post carries
-- one thing the reader didn't know, otherwise it doesn't go).
--   * The model-v-market difference leads the thread (the hook); the market
--     overview follows.
--   * Differences of 5+ points are named (was 10+).
--   * A day with no difference of 8+ points and no review due posts nothing.
--   * No 65%+ favourite: the three biggest favourites are listed instead.
--   * The heading names the league when every game is in one league.
-- ============================================================================

create or replace function private.social_detect_daily_market(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_now timestamp := now() at time zone 'Europe/London';
  v_today date := (now() at time zone 'Europe/London')::date;
  v_key text := format('daily_market:%s', (now() at time zone 'Europe/London')::date);
  v_games jsonb; v_n integer; v_first timestamp; v_fav jsonb; v_close integer; v_mis jsonb;
  v_posts text[] := '{}'; v_p text; v_review text; v_prev public.social_post_candidates; v_rev jsonb;
  v_won integer; v_listed integer; v_missing integer; v_id bigint; v_post_after timestamp; v_expires timestamp;
  v_lines text; v_strong boolean; v_label text; v_overview text; v_mrow jsonb; v_side text; v_dayname text := trim(to_char((now() at time zone 'Europe/London')::date, 'Day'));
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
        select v_review || format(E'\nThe favourites we listed won %s of %s (%s)', v_won, v_listed,
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
    v_strong := jsonb_array_length(v_fav) > 0;
    if not v_strong then
      select coalesce(jsonb_agg(jsonb_build_object('fixture_id', g->>'fixture_id', 'lg', g->>'lg',
                                                   'side', case when (g->>'mh')::numeric >= (g->>'ma')::numeric then 'home' else 'away' end,
                                                   'team', case when (g->>'mh')::numeric >= (g->>'ma')::numeric then g->>'home' else g->>'away' end,
                                                   'opp', case when (g->>'mh')::numeric >= (g->>'ma')::numeric then g->>'away' else g->>'home' end,
                                                   'p', greatest((g->>'mh')::numeric, (g->>'ma')::numeric))
                                order by ord), '[]')
        into v_fav
        from (select g, ord from jsonb_array_elements(v_games) with ordinality t(g, ord) order by ord limit 3) s;
    end if;
    select count(*) into v_close from jsonb_array_elements(v_games) g where greatest((g->>'mh')::numeric, (g->>'ma')::numeric) < 0.40;

    v_label := case when (select count(distinct g->>'lg') from jsonb_array_elements(v_games) g) = 1
                    then (select l.name from public.leagues l where l.league_id = (v_games->0->>'league_id')::bigint)
                    else 'English football' end;
    v_p := format('%s''s %s (%s games) as the betting market sees it', v_dayname, v_label, v_n);
    if jsonb_array_length(v_fav) > 0 then
      select v_p || case when v_strong then E'\n\nStrong favourites (65%+):\n' else E'\n\nBiggest favourites (none at 65%+):\n' end || string_agg(format('%s v %s%s %s', f->>'team', f->>'opp', case when v_label = 'English football' then ' (' || (f->>'lg') || ')' else '' end, private.social_pct((f->>'p')::numeric)), E'\n')
        into v_p from jsonb_array_elements(v_fav) f;
    end if;
    v_p := v_p || case when v_close = 0 then E'\n\nNo game is a coin flip (no side under 40%).'
                       when v_close = 1 then E'\n\n1 game is a coin flip: no side above 40%.'
                       else format(E'\n\n%s games are coin flips: no side above 40%%.', v_close) end;
    v_overview := v_p;

    -- Biggest difference between our model and the market (any outcome), teams with real ratings only.
    select g || jsonb_build_object('gap', gap, 'outcome', outcome) into v_mis
      from (select g, o.outcome, abs(o.pm - o.mm) gap
              from jsonb_array_elements(v_games) g
              cross join lateral (values ('home', (g->>'ph')::numeric, (g->>'mh')::numeric),
                                         ('draw', (g->>'pd')::numeric, (g->>'md')::numeric),
                                         ('away', (g->>'pa')::numeric, (g->>'ma')::numeric)) o(outcome, pm, mm)
             where not (g->>'estimated')::boolean) s
     where gap >= 0.05
     order by gap desc, g->>'fixture_id' limit 1;
    if v_mis is not null then
      v_posts := v_posts || format(E'Where our model and the betting market disagree most today 🧵\n%s v %s%s\n\n%s\nMarket: %s / %s / %s\nOur model: %s / %s / %s\n\nNot a tip, just where we see it differently. We''ll report back tomorrow.',
        v_mis->>'home', v_mis->>'away', case when v_label = 'English football' then ' (' || (v_mis->>'lg') || ')' else '' end, 'Home / draw / away',
        private.social_pct((v_mis->>'mh')::numeric), private.social_pct((v_mis->>'md')::numeric), private.social_pct((v_mis->>'ma')::numeric),
        private.social_pct((v_mis->>'ph')::numeric), private.social_pct((v_mis->>'pd')::numeric), private.social_pct((v_mis->>'pa')::numeric));
      v_posts := v_posts || v_overview;
    else
      v_posts := v_posts || (v_overview || E'\n\nOur model and the market broadly agree on every game today.');
    end if;
  end if;

  if v_review is null and coalesce((v_mis->>'gap')::numeric, 0) < 0.08 then
    return jsonb_build_object('status', 'none', 'reason', 'nothing worth posting: no model-v-market gap of 8+ points and no review due',
                              'games', v_n, 'biggest_gap', v_mis->>'gap');
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
          jsonb_build_object('date', v_today, 'games', v_n, 'favourites', coalesce(v_fav, '[]'), 'strong', v_strong, 'coin_flips', v_close,
                             'mismatch', v_mis, 'review_of', v_prev.candidate_id, 'review', v_review is not null,
                             'post_after', v_post_after at time zone 'Europe/London'),
          now(), v_key, v_expires at time zone 'Europe/London', 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'daily_market', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'games', v_n, 'review', v_review is not null);
end;
$$;

-- Hook A/B test (20261105120000): Chris, 5 Nov 2026, "go with recommendations".
-- 1. Run to the end of Wed 2 Dec (UK) instead of 18 Nov, so it covers GW11 and
--    GW12: the international break left only about three posts in the window.
-- 2. No automatic switch. When the test ends the result is recorded and shown
--    in the morning and evening emails, and posts keep alternating styles
--    until Chris chooses one (private.social_hook_test.default_style, set by
--    migration). Safe to re-run.

update private.social_hook_test
   set ends_at = (timestamp '2026-12-03 00:00' at time zone 'Europe/London')
 where id and decided_at is null and ends_at <> (timestamp '2026-12-03 00:00' at time zone 'Europe/London');

-- Records the result once; never sets default_style.
create or replace function private.social_hook_decide()
returns text language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare t private.social_hook_test; st jsonb; v_win text; v_avg_a numeric; v_avg_b numeric;
begin
  select * into t from private.social_hook_test for update;
  if t.id is null or now() < t.ends_at then return null; end if;
  if t.decided_at is not null then return t.result->>'winner'; end if;
  st := private.social_hook_test_stats(now());
  v_avg_a := (st->'A'->>'avg')::numeric; v_avg_b := (st->'B'->>'avg')::numeric;
  v_win := case when v_avg_a is null or v_avg_b is null or v_avg_a = v_avg_b then null
                when v_avg_b > v_avg_a then 'B' else 'A' end;
  update private.social_hook_test set decided_at = now(), result = st || jsonb_build_object('winner', v_win)
   where id;
  return v_win;
end;
$$;

-- After the end: Chris's chosen style if set, else keep alternating (not counted in the test).
create or replace function private.social_hook_style(p_type text, p_slot text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare t private.social_hook_test; v text; n int; v_off int; v_test boolean;
begin
  select * into t from private.social_hook_test;
  if t.id is null then return jsonb_build_object('style', 'A', 'test', false); end if;
  if t.default_style is not null and now() >= t.ends_at then
    return jsonb_build_object('style', t.default_style, 'test', false);
  end if;
  v_test := now() < t.ends_at;
  if not v_test then perform private.social_hook_decide(); end if;
  -- A re-made candidate for the same slot keeps that slot's style.
  select c.source_data->>'hook_style' into v from public.social_post_candidates c
   where c.post_type = p_type and c.source_data->>'hook_slot' = p_slot and c.source_data->>'hook_style' in ('A', 'B')
     and c.created_at >= t.started_at
   order by c.candidate_id desc limit 1;
  if v is null then
    select count(distinct c.source_data->>'hook_slot') into n from public.social_post_candidates c
     where c.post_type = p_type and c.source_data->>'hook_style' in ('A', 'B')
       and c.created_at >= t.started_at;
    v_off := case p_type when 'fpl_week_changes' then 1 when 'gameweek_outlook' then 1 else 0 end;
    v := case when (n + v_off) % 2 = 0 then 'A' else 'B' end;
  end if;
  return jsonb_build_object('style', v, 'test', v_test);
end;
$$;

create or replace function private.social_hook_test_line(p_at timestamptz)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t private.social_hook_test; st jsonb; v_day int; v_len int; v_win text;
begin
  select * into t from private.social_hook_test;
  if t.id is null or p_at < t.started_at then return null; end if;
  v_len := ((t.ends_at at time zone 'Europe/London')::date - (t.started_at at time zone 'Europe/London')::date);
  if p_at < t.ends_at then
    st := private.social_hook_test_stats(p_at);
    v_day := least(v_len, greatest(1, ((p_at at time zone 'Europe/London')::date - (t.started_at at time zone 'Europe/London')::date) + 1));
    return format('Hook test (day %s of %s, to %s): data-first %s, %s; question-first %s, %s.', v_day, v_len,
                  to_char(t.ends_at at time zone 'Europe/London' - interval '1 day', 'FMDD Mon'),
                  private.digest_n((st->'A'->>'posts')::int, 'post'), private.social_hook_avg(st->'A'),
                  private.digest_n((st->'B'->>'posts')::int, 'post'), private.social_hook_avg(st->'B'));
  end if;
  -- Finished: shown until Chris picks a style, then for 7 days after the end.
  if t.default_style is not null and p_at > t.ends_at + interval '7 days' then return null; end if;
  st := coalesce(t.result, private.social_hook_test_stats(p_at));
  v_win := case when t.decided_at is not null then st->>'winner'
                when (st->'A'->>'avg') is null or (st->'B'->>'avg') is null or (st->'A'->>'avg')::numeric = (st->'B'->>'avg')::numeric then null
                when (st->'B'->>'avg')::numeric > (st->'A'->>'avg')::numeric then 'B' else 'A' end;
  return format('Hook test finished %s: data-first %s, %s; question-first %s, %s. %s', to_char(t.ends_at at time zone 'Europe/London' - interval '1 day', 'FMDD Mon'),
                private.digest_n((st->'A'->>'posts')::int, 'post'), private.social_hook_avg(st->'A'),
                private.digest_n((st->'B'->>'posts')::int, 'post'), private.social_hook_avg(st->'B'),
                case when t.default_style is not null then format('Using %s openings, as you chose.', case t.default_style when 'A' then 'data-first' else 'question-first' end)
                     when v_win is null then 'Too few posts with figures to pick a winner. Posts keep alternating until you choose a style.'
                     else format('Better: %s. Posts keep alternating until you choose; tell Claude which to keep.',
                                 case v_win when 'A' then 'data-first' else 'question-first' end) end);
end;
$$;

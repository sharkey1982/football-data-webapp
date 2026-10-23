-- ============================================================================
-- Social publishing: GW8 captaincy and team-news posts were missed (23 Oct).
-- docs/incidents.md has the detail.
--  1. Captaincy: the queued ranking went stale when one projected value moved
--     by 0.1, and the detector only made a new candidate when the top three
--     players changed, so nothing replaced it. The candidate key now covers
--     every number in the post; a replacement posts 15 minutes after it is
--     made; the detector runs until 90 minutes before the deadline; and once a
--     gameweek's captaincy has posted it stops.
--  2. A post's hold now ends at least 20 minutes before it expires, so the
--     10-minute worker always reaches it.
--  3. A stale queued candidate is retired instead of being re-checked (and
--     audited) every 10 minutes until it expires.
-- Each change is a string replacement on the live definition, every anchor
-- asserted to match exactly once; re-running skips changes already applied.
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

select pg_temp.social_patch('private.social_detect_captaincy(bigint)', $o$v_deadline < now() + interval '3 hours'$o$, $n$v_deadline < now() + interval '90 minutes'$n$);
select pg_temp.social_patch('private.social_detect_captaincy(bigint)', $o$is outside the 72h-3h window$o$, $n$is outside the 72h-90m window$n$);
select pg_temp.social_patch('private.social_detect_captaincy(bigint)', $o$
  select model_version into v_mv from public.fpl_player_projections where season_id = v_season order by generated_at desc limit 1;
$o$, $n$
  -- One captaincy post per gameweek: once posted (or possibly posted), stop.
  if exists (select 1 from public.social_post_candidates where post_type = 'fpl_captaincy'
               and (source_data->>'season_id')::bigint = v_season and (source_data->>'gw')::int = v_gw
               and publication_status in ('publishing', 'published', 'needs_check')) then
    return jsonb_build_object('status', 'none', 'reason', format('GW%s captaincy already posted', v_gw));
  end if;

  select model_version into v_mv from public.fpl_player_projections where season_id = v_season order by generated_at desc limit 1;
$n$);
select pg_temp.social_patch('private.social_detect_captaincy(bigint)', $o$(select string_agg(t->>'fpl_player_id', '-' order by (t->>'rank')::int) from jsonb_array_elements(v_top) t where (t->>'rank')::int <= 3),$o$, $n$-- Template 3 (23 Oct 2026): keyed on every number in the post, so a ranking that
                  -- goes stale is replaced by the next run instead of blocking it.
                  (select md5(string_agg(concat_ws('/', t->>'fpl_player_id', round((t->>'xpts')::numeric, 1), t->>'now_cost'), '-' order by (t->>'rank')::int)
                              || coalesce(v_blank, '')) from jsonb_array_elements(v_top) t),$n$);
select pg_temp.social_patch('private.social_detect_captaincy(bigint)', $o$'fpl_captaincy:%s:%s:%s:%s:t2%s'$o$, $n$'fpl_captaincy:%s:%s:%s:%s:t3%s'$n$);
select pg_temp.social_patch('private.social_detect_captaincy(bigint)', $o$'top three unchanged since the last candidate'$o$, $n$'ranking unchanged since the last candidate'$n$);
select pg_temp.social_patch('private.social_auto_queue()', $o$v_hold := greatest(v_hold, (c.source_data->>'deadline')::timestamptz - interval '24 hours');$o$, $n$-- 24h before the deadline; a replacement made later goes 15 minutes after it is made.
      v_hold := greatest(now() + interval '15 minutes', (c.source_data->>'deadline')::timestamptz - interval '24 hours');$n$);
select pg_temp.social_patch('private.social_auto_queue()', $o$    -- One queued post per type and expiry$o$, $n$    -- Due at least 20 minutes before it expires, so a 10-minute tick always reaches it
    -- (23 Oct: a team-news thread due 17:25 for a 17:30 deadline was never sent).
    v_hold := greatest(now(), least(v_hold, c.expires_at - interval '20 minutes'));
    -- One queued post per type and expiry$n$);
select pg_temp.social_patch('public.social_auto_tick()', $o$publication_status in ('unpublished') and not held$o$, $n$publication_status in ('unpublished') and validation_status = 'passed' and not held$n$);
select pg_temp.social_patch('public.social_auto_tick()', $o$update public.social_post_candidates set validation_status = 'stale', validation_errors = v_errors, validated_at = now(), updated_at = now()
       where candidate_id = c.candidate_id;
      perform private.social_audit('auto_stale'$o$, $n$update public.social_post_candidates set approval_status = 'superseded', validation_status = 'stale', validation_errors = v_errors,
             validated_at = now(), updated_at = now()
       where candidate_id = c.candidate_id;
      perform private.social_audit('auto_stale'$n$);

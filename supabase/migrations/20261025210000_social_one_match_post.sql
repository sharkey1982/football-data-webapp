-- ============================================================================
-- One match post a day (Chris, 25 Oct 2026: "go with your recommendations").
--   * The standalone match-day predictions post (expected goals + channel for
--     every PL game) stops: it told readers nothing new. Its detector no
--     longer runs; unposted ones are superseded.
--   * The daily market view becomes the match post and goes automatic.
--   * Where to watch only where it adds something: the featured game (the
--     biggest model-v-market difference) shows its kick-off and, when
--     confirmed, its UK channel.
-- ============================================================================

update public.social_settings
   set auto_post_types = array_append(array_remove(array_remove(auto_post_types, 'match_predictions'), 'daily_market'), 'daily_market'),
       updated_at = now()
 where id;

update public.social_post_candidates set approval_status = 'superseded', updated_at = now()
 where post_type = 'match_predictions' and publication_status = 'unpublished' and approval_status in ('pending', 'approved');

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
  $o$'fixture_moves', 'match_predictions', 'quiz'$o$,
  $n$'fixture_moves', 'quiz'$n$);

select pg_temp.social_patch('private.social_detect_daily_market(bigint)',
  $o$disagree most today 🧵\n%s v %s%s\n\n%s\nMarket:$o$,
  $n$disagree most today 🧵\n%s v %s%s\n%s\n\n%s\nMarket:$n$);

select pg_temp.social_patch('private.social_detect_daily_market(bigint)',
  $o$else '' end, 'Home / draw / away',$o$,
  $n$else '' end,
        'Kick-off ' || to_char((v_mis->>'kickoff_time')::time, 'HH24:MI')
          || coalesce(' · ' || (select b.broadcaster from public.fixture_broadcasts b
                                 where b.fixture_id = (v_mis->>'fixture_id')::bigint and b.market = 'GB'
                                   and b.status = 'confirmed_broadcast' and b.confidence like 'confirmed%'
                                 order by b.broadcast_id limit 1), ''),
        'Home / draw / away',$n$);

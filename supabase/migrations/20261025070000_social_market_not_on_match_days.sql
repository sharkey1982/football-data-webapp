-- Market watch: not on Premier League match days (Chris, 25 Oct 2026: the
-- Saturday-evening post "was a bit pointless" while games were on). It runs
-- only on days without a league fixture. String replacement on the live
-- definition; re-running skips it once applied.
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

select pg_temp.social_patch('private.social_detect_market(bigint)',
$o$    return jsonb_build_object('status', 'none', 'reason', 'transfers have just reset after the deadline');
  end if;$o$,
$n$    return jsonb_build_object('status', 'none', 'reason', 'transfers have just reset after the deadline');
  end if;
  if exists (select 1 from public.fpl_fixtures where season_id = v_season
               and (kickoff_time at time zone 'Europe/London')::date = v_today) then
    return jsonb_build_object('status', 'none', 'reason', 'Premier League match day');
  end if;$n$);

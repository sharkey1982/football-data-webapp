-- Chris, 28 Oct 2026: "I thought it was saying Venezia were the favourites?"
-- The gap post labelled its columns "Home / draw / away"; name the teams
-- instead: "Venezia FC / draw / Inter Milan" ("win" twice pushed long names over 280).
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
select pg_temp.social_patch('private.social_detect_daily_market(bigint)',
  $o$        'Home / draw / away',$o$,
  $n$        format('%s / draw / %s', v_mis->>'home', v_mis->>'away'),$n$);

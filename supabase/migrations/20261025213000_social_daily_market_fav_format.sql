-- Daily market view: an away favourite was written "{favourite} v {home
-- side}", which reads as if the favourite were at home. Keep the fixture the
-- right way round and put the percentage next to the favourite:
--   "Huddersfield 70% v Wigan (L1)", "Crystal Palace v Newcastle 41%".
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
  $o$string_agg(format('%s v %s%s %s', f->>'team', f->>'opp', case when v_label in ('English football', 'football') then ' (' || (f->>'lg') || ')' else '' end, private.social_pct((f->>'p')::numeric)), E'\n')$o$,
  $n$string_agg(case when f->>'side' = 'home'
                         then format('%s %s v %s', f->>'team', private.social_pct((f->>'p')::numeric), f->>'opp')
                         else format('%s v %s %s', f->>'opp', f->>'team', private.social_pct((f->>'p')::numeric)) end
                    || case when v_label in ('English football', 'football') then ' (' || (f->>'lg') || ')' else '' end, E'\n')$n$);

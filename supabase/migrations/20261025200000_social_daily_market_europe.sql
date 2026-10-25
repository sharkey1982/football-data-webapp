-- ============================================================================
-- Daily market view: include Serie A (15) and the Scottish Premiership (22)
-- (Chris, 25 Oct 2026: the two leagues that passed Model Lab E1 go live
-- beside the market). Games only appear once they have a prediction from an
-- accepted fit made before kick-off, so nothing changes until those leagues'
-- first fits run (daily-import-international.yml).
--
-- After the v2 tweaks (20261025190000). A day mixing English and these
-- leagues is headed "football" rather than "English football", and its
-- lines keep their league tag.
-- ============================================================================

create or replace function private.social_league_short(p_league_id bigint) returns text
language sql immutable as $$
  select case p_league_id when 1 then 'PL' when 2 then 'Champ' when 3 then 'L1' when 4 then 'L2' when 5 then 'NL'
                          when 15 then 'Serie A' when 22 then 'SPL' end
$$;

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

select pg_temp.social_patch('private.social_daily_games(date)',
  $o$f.league_id between 1 and 5$o$,
  $n$f.league_id in (1, 2, 3, 4, 5, 15, 22)$n$);

select pg_temp.social_patch('private.social_detect_daily_market(bigint)',
  $o$else 'English football' end;$o$,
  $n$when (select bool_and((g->>'league_id')::int between 1 and 5) from jsonb_array_elements(v_games) g) then 'English football'
                    else 'football' end;$n$);

select pg_temp.social_patch('private.social_detect_daily_market(bigint)',
  $o$case when v_label = 'English football' then ' (' || (f->>'lg')$o$,
  $n$case when v_label in ('English football', 'football') then ' (' || (f->>'lg')$n$);

select pg_temp.social_patch('private.social_detect_daily_market(bigint)',
  $o$case when v_label = 'English football' then ' (' || (v_mis->>'lg')$o$,
  $n$case when v_label in ('English football', 'football') then ' (' || (v_mis->>'lg')$n$);

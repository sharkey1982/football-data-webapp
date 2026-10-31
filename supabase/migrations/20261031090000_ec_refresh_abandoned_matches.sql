-- ============================================================================
-- National League fixture refresh: abandoned matches (31 Oct 2026).
--
-- Barrow v Forest Green Rovers was abandoned on 24 Oct and rearranged for
-- 15 Dec. FootballWebPages lists both rows (the abandoned one with its own
-- id, titled "... - Abandoned", and the new date), so from 29 Oct every run
-- of refresh_national_league_fixtures() found the pairing twice, left it
-- unchanged and recorded the run as failed. Fixture 6206 stayed "scheduled"
-- on 24 Oct.
--
-- Now: an abandoned row is never a result (its score is ignored) and is
-- dropped when the same pairing has another row (the rearranged date). An
-- abandoned row with no rearranged date yet is treated as postponed.
-- ============================================================================

create or replace function pg_temp.patch(p_sig text, p_old text, p_new text) returns void language plpgsql as $f$
declare d text; n integer;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_new in d) > 0 then return; end if;
  n := (length(d) - length(replace(d, p_old, ''))) / length(p_old);
  if n <> 1 then raise exception 'patch: % anchor found % times: %', p_sig, n, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end;
$f$;

-- 1. Parse an "abandoned" flag; abandoned rows count as postponed and carry no score.
select pg_temp.patch('public.refresh_national_league_fixtures()',
  $o$          substring(tr from 'title="[^"]*"') ~* ' - postponed"' postponed,$o$,
  $n$          substring(tr from 'title="[^"]*"') ~* ' - (postponed|abandoned)"' postponed,
          substring(tr from 'title="[^"]*"') ~* ' - abandoned"' abandoned,$n$);
select pg_temp.patch('public.refresh_national_league_fixtures()',
  $o$          substring(tr from '<td class="score home-score">(\d+)</td>')::int hg,
          substring(tr from '<td class="score away-score">(\d+)</td>')::int ag$o$,
  $n$          case when substring(tr from 'title="[^"]*"') ~* ' - abandoned"' then null
               else substring(tr from '<td class="score home-score">(\d+)</td>')::int end hg,
          case when substring(tr from 'title="[^"]*"') ~* ' - abandoned"' then null
               else substring(tr from '<td class="score away-score">(\d+)</td>')::int end ag$n$);

-- 2. Drop an abandoned row when the pairing has another (rearranged) row.
select pg_temp.patch('public.refresh_national_league_fixtures()',
  $o$    -- A pairing listed twice cannot be matched safely: leave it alone and report.$o$,
  $n$    -- An abandoned match listed beside its rearranged date: keep the new date (31 Oct 2026).
    delete from _ec e where e.abandoned
      and exists (select 1 from _ec x where x.home_id = e.home_id and x.away_id = e.away_id and not x.abandoned);

    -- A pairing listed twice cannot be matched safely: leave it alone and report.$n$);

-- 3. Run it now so fixture 6206 moves to its new date.
select public.refresh_national_league_fixtures();

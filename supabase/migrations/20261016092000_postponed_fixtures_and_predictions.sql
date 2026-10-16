-- ============================================================================
-- Postponed fixtures and stale predictions (16 Oct 2026).
--
-- 1. played_without_result (10 fixtures, failing daily): nine League One/Two
--    fixtures of 26 Sep and 3 Oct and La Liga's Rayo v Athletic (10 Oct) were
--    marked PLAYED though they never finished. refresh_fixture_feeds sets
--    status = 'played' as soon as the feed's kick-off time passes; the
--    FixtureDownload feed keeps a postponed game at its original date and
--    simply never gets a score. Football Web Pages and football-data.co.uk
--    both list only 3 League One games on 3 Oct; Rayo v Athletic was
--    suspended after objects were thrown.
--    reconcile_unreported_played_fixtures() runs at the end of every feed
--    refresh and marks a fixture POSTPONED only on positive evidence: kick-off
--    3+ days ago, no score in the fixture feed, no result in matches, AND
--    matches already holds results for that league dated after it (the
--    results source has covered the weekend and this game is not there).
--    sync_fixture_status_from_results turns it back to played when a result
--    arrives; the feed's new date moves it when rescheduled.
-- 2. Fixture 6186 (Scunthorpe v Forest Green, National League, postponed
--    3 Oct, no new date) kept its prediction from fit 966 while fit 1031 is
--    the latest accepted one. The kick-off guard compared every fit with the
--    ORIGINAL date (3 Oct), so no fit after 2 Oct could ever refresh it. A
--    postponed fixture has not been played, so a fit dated before today is
--    not hindsight: the guard now uses greatest(kick-off, today) for
--    postponed fixtures (public.prediction_fit_eligible). Played fixtures
--    are unaffected; their guard is still the kick-off date, and the existing
--    played_prediction_point_in_time check still fails on any hindsight one.
-- 3. New warning upcoming_predictions_current: scheduled or postponed
--    fixtures not predicted from the latest fit they are eligible for.
-- ============================================================================

create or replace function public.prediction_fit_eligible(p_fitted_at timestamptz, p_kickoff date, p_status text)
returns boolean language sql stable set search_path = '' as $$
  select p_fitted_at::date < case when p_status = 'postponed' then greatest(p_kickoff, current_date) else p_kickoff end
$$;
comment on function public.prediction_fit_eligible(timestamptz, date, text) is
  'Point-in-time rule for live predictions: a fit may predict a fixture only if dated before kick-off; for a postponed fixture (not yet played, maybe no new date) before greatest(kick-off, today).';

do $$
declare d text; a text := 'and lf.fitted_at::date < f.kickoff_date';
begin
  d := pg_get_functiondef('public.backfill_fixture_predictions()'::regprocedure);
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then
    raise exception 'backfill_fixture_predictions kick-off guard anchor not found exactly once';
  end if;
  execute replace(d, a, 'and public.prediction_fit_eligible(lf.fitted_at, f.kickoff_date, f.status)');
end $$;

create or replace function public.reconcile_unreported_played_fixtures()
returns integer language sql security definer set search_path = '' as $$
  with upd as (
    update public.fixtures f set status = 'postponed', updated_at = now()
    where f.status = 'played'
      and f.kickoff_date <= current_date - 3
      and f.reported_home_goals is null
      and not exists (select 1 from public.matches m
                      where m.league_id = f.league_id and m.season_id = f.season_id
                        and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
                        and m.match_date between f.kickoff_date - 3 and f.kickoff_date + 3)
      and exists (select 1 from public.matches m
                  where m.league_id = f.league_id and m.season_id = f.season_id
                    and m.match_date > f.kickoff_date + 1)
    returning 1)
  select count(*)::integer from upd
$$;
revoke all on function public.reconcile_unreported_played_fixtures() from public, anon, authenticated;
grant execute on function public.reconcile_unreported_played_fixtures() to service_role;

do $$
declare d text; a text := 'select public.backfill_fixture_predictions() into v_predictions;';
begin
  d := pg_get_functiondef('public.refresh_fixture_feeds()'::regprocedure);
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then
    raise exception 'refresh_fixture_feeds anchor not found exactly once';
  end if;
  execute replace(d, a,
    'perform public.reconcile_unreported_played_fixtures(); -- 2026-10-16: kicked-off is not played' || chr(10) || ' ' || a);
end $$;

do $$
declare d text; a text := '  union all
  -- Catalogue (2026-09-26)';
begin
  d := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  if position(a in d) = 0 then raise exception 'catalogue anchor not found'; end if;
  d := replace(d, a, '  union all
  -- Stale predictions (2026-10-16): scheduled/postponed fixtures must carry
  -- the latest accepted fit they are eligible for (fixture 6186 kept fit 966).
  select ''upcoming_predictions_current'', case when n = 0 then ''ok'' else ''warning'' end, n,
    ''Scheduled or postponed fixtures not predicted from their latest eligible accepted fit (backfill_fixture_predictions): '' || coalesce(ids, ''none'')
  from (select count(*) n, string_agg(f.fixture_id || '' fit '' || coalesce(f.prediction_fit_run_id::text, ''none'') || ''->'' || lf.fit_run_id, '', '' order by f.fixture_id) ids
        from public.fixtures f
        join lateral (select r.fit_run_id from public.model_fit_runs r
                      where r.league_id = f.league_id and r.status = ''accepted''
                        and public.prediction_fit_eligible(r.fitted_at, f.kickoff_date, f.status)
                      order by r.fitted_at desc limit 1) lf on true
        join public.team_ratings hr on hr.fit_run_id = lf.fit_run_id and hr.team_id = f.home_team_id
        join public.team_ratings ar on ar.fit_run_id = lf.fit_run_id and ar.team_id = f.away_team_id
        where f.status in (''scheduled'', ''postponed'')
          and (f.kickoff_date >= current_date or f.status = ''postponed'')
          and f.prediction_fit_run_id is distinct from lf.fit_run_id) x
' || a);
  execute d;
end $$;

-- Apply now, then prove it.
select public.reconcile_unreported_played_fixtures();
select public.backfill_fixture_predictions();

do $$
declare n int; bad text;
begin
  -- the ten fixtures behind played_without_result are no longer "played"
  select string_agg(fixture_id::text, ', ') into bad from public.fixtures
   where fixture_id in (1123, 1158, 1314, 1326, 1368, 1384, 1393, 1484, 1599, 4536) and status = 'played';
  if bad is not null then raise exception 'still marked played without a result: %', bad; end if;
  -- 6186 now carries the latest accepted National League fit
  if (select f.prediction_fit_run_id from public.fixtures f where f.fixture_id = 6186)
     is distinct from (select r.fit_run_id from public.model_fit_runs r where r.league_id = 5 and r.status = 'accepted' order by r.fitted_at desc limit 1)
     and (select status from public.fixtures where fixture_id = 6186) = 'postponed' then
    raise exception 'fixture 6186 was not refreshed to the latest accepted fit';
  end if;
  -- guard truth table
  if public.prediction_fit_eligible(now(), current_date - 5, 'scheduled') then raise exception 'scheduled: fit after kick-off allowed'; end if;
  if public.prediction_fit_eligible(now(), current_date - 5, 'played') then raise exception 'played: fit after kick-off allowed'; end if;
  if not public.prediction_fit_eligible(now() - interval '1 day', current_date - 5, 'postponed') then raise exception 'postponed: yesterday''s fit refused'; end if;
  if public.prediction_fit_eligible(now(), current_date - 5, 'postponed') then raise exception 'postponed: today''s fit allowed'; end if;
  if public.prediction_fit_eligible(now(), current_date, 'postponed') then raise exception 'postponed to today: today''s fit allowed'; end if;
  if not public.prediction_fit_eligible(now() - interval '2 days', current_date + 3, 'scheduled') then raise exception 'scheduled: earlier fit refused'; end if;
  -- nothing played may carry a hindsight prediction
  select count(*) into n from public.check_model_integrity()
   where check_name in ('played_prediction_point_in_time', 'upcoming_prediction_from_accepted_fit') and status <> 'ok';
  if n > 0 then raise exception 'point-in-time checks fail after the refresh'; end if;
end $$;

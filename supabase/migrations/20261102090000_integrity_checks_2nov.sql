-- Integrity checks, 2 Nov 2026: the daily run had 3 failures
-- (fixture_feed_names_mapped, jobs_stale, github_scheduled_runs_ok) and
-- several warnings that were the check's fault rather than the data's.
--
-- 1. fixture_feed_names_mapped (371 found) -- CHECK WRONG.
--    Since DQ-01 (22 Oct) refresh_fixture_feeds() deliberately skips every
--    Premier League fixture whose kick-off comes from FPL, so those rows'
--    updated_at stopped moving and all 371 unplayed/recent E0 fixtures looked
--    "not refreshed by the feed". E1-E3 were all fresh. Not cup ties: the check
--    only covers E0-E3. FPL-owned fixtures are now left out (they are guarded
--    by pl_kickoff_matches_fpl); any E0 fixture FPL does not own is still checked.
--
-- 2. reported_vs_confirmed (1) -- DATA WRONG + PIPELINE GAP + CHECK DETAIL BUG.
--    Fixture 1470, League One Bromley v Leicester, 20 Oct: FixtureDownload
--    reported 2-0; football-data.co.uk (and independent results listings) have
--    Bromley 0-4 Leicester. The FixtureDownload step kept re-applying its score
--    whatever the confirmed result said; it now leaves fixtures that already
--    have a confirmed result alone (as refresh_efl_reported_scores already
--    does), and the row is corrected. The check's list was empty because it
--    numbered the 10 most recent fixtures with ANY reported score before
--    filtering to mismatches; it now numbers only the mismatches.
--
-- 3. fpl_projection_respects_chance_of_playing (4) -- CHECK TOO STRICT.
--    All four (Tomiyasu, Sarr, Azeez, Struijk) are "Expected back 8 Nov" with
--    FPL chance 0, and their GW10 game is on 8 Nov: the availability view's
--    deliberate 'returning' rule gives 0.75 for the first match on or after the
--    return date. The check now accepts a projection that is within the live
--    availability view's figure for that rule (stale availability is still
--    caught: the view is live, the projection is not).
--
-- 4. jobs_stale -- REGISTRY SETTINGS.
--    * indexnow: hourly GitHub cron, but GitHub ran it only 4 times on 1 Nov
--      (gaps of up to 6 h) -- scheduled-run throttling, not a broken job.
--      Expected interval 3 h -> 12 h.
--    * schema-snapshot: the workflow itself was broken (see schema-snapshot.yml:
--      the Supabase CLI now writes unformatted types). Fixed there, no change here.
--    * email-weekly: a fixed 16-day interval goes stale every summer and over
--      long breaks. Its timing is now checked per FPL deadline in
--      check_deadline_runs (deadline_run_email-weekly: a successful send in the
--      3 days before the latest deadline; nothing to check when no deadline has
--      passed in 8 days), and job_health only reports its failures
--      (expected_interval null). email-weekly-tick (hourly) still has a 3 h
--      staleness limit, so a dead scheduler is still caught.
--
-- 5. jobs_registry_gaps (6, warning): the five pg_cron jobs added since 31 Oct
--    and the email test send are registered.
--
-- Safe to re-run: function changes are guarded or create-or-replace; the data
-- fix only touches the row while it still holds the wrong score.

-- ---------------------------------------------------------------- 1. feed names check
create or replace function public.check_fixture_feed_names()
 returns table(check_name text, status text, found bigint, detail text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select 'fixture_feed_names_mapped',
    case when count(*) = 0 then 'ok' else 'failed' end,
    count(*),
    'Current-season E0-E3 fixtures not refreshed by the FixtureDownload feed for 3+ days (an unmapped team name in team_aliases?); Premier League fixtures whose kick-off comes from FPL are excluded (pl_kickoff_matches_fpl covers them): '
      || coalesce(array_to_string((array_agg(l.code || ' ' || ht.canonical_name || ' v ' || at.canonical_name order by f.kickoff_date))[1:10], ', '), '')
  from public.fixtures f
  join public.leagues l on l.league_id = f.league_id
  join public.teams ht on ht.team_id = f.home_team_id
  join public.teams at on at.team_id = f.away_team_id
  where l.code in ('E0', 'E1', 'E2', 'E3')
    and f.season_id = public.current_season_id()
    and f.updated_at < now() - interval '3 days'
    -- DQ-01 (22 Oct 2026): refresh_fixture_feeds() skips these on purpose.
    and not exists (select 1 from public.fpl_fixtures ff
                     where ff.canonical_fixture_id = f.fixture_id and ff.kickoff_time is not null)
$function$;

-- ---------------------------------------------------------------- 2a. feed leaves confirmed results alone
do $mig$
declare
  d text := pg_get_functiondef('public.refresh_fixture_feeds()'::regprocedure);
  a text := $a$    and (f.reported_home_goals is distinct from m.hg or f.reported_away_goals is distinct from m.ag);$a$;
  b text := $b$    and (f.reported_home_goals is distinct from m.hg or f.reported_away_goals is distinct from m.ag)
    -- 2 Nov 2026: a confirmed result wins (FixtureDownload had Bromley 2-0 Leicester for a 0-4).
    and not private.fixture_has_result(f.league_id, f.season_id, f.home_team_id, f.away_team_id, f.kickoff_date);$b$;
begin
  if position('a confirmed result wins (FixtureDownload' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'refresh_fixture_feeds anchor not found exactly once'; end if;
  execute replace(d, a, b);
end;
$mig$;

-- ---------------------------------------------------------------- 2b + 3. check_model_integrity
do $mig$
declare
  d text := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  -- reported_vs_confirmed: number only the mismatching fixtures
  a1 text := $a$where f.reported_home_goals is not null) f$a$;
  b1 text := $b$where f.reported_home_goals is not null
                and exists (select 1 from public.matches m2
                             where m2.league_id = f.league_id and m2.season_id = f.season_id
                               and m2.home_team_id = f.home_team_id and m2.away_team_id = f.away_team_id
                               and m2.match_date between f.kickoff_date - 3 and f.kickoff_date + 3
                               and m2.full_time_home_goals is not null
                               and (m2.full_time_home_goals <> f.reported_home_goals
                                    or m2.full_time_away_goals <> f.reported_away_goals))) f$b$;
  -- chance of playing: the availability view's 'returning' rule is deliberate
  a2 text := $a$and p.start_probability > fp.chance_of_playing_next_round / 100.0 + 0.02) x$a$;
  b2 text := $b$and p.start_probability > fp.chance_of_playing_next_round / 100.0 + 0.02
           -- 2 Nov 2026: first match on/after an "Expected back" date (rule 'returning') may exceed FPL's 0
           and not exists (select 1 from public.fpl_player_fixture_availability av
                             where av.fpl_player_id = p.fpl_player_id and av.fixture_id = p.fixture_id
                               and av.rule = 'returning'
                               and p.start_probability <= av.availability + 0.02)) x$b$;
begin
  if position('2 Nov 2026: first match on/after' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 then raise exception 'check_model_integrity anchor a1 not found exactly once'; end if;
  if (length(d) - length(replace(d, a2, ''))) / length(a2) <> 1 then raise exception 'check_model_integrity anchor a2 not found exactly once'; end if;
  execute replace(replace(d, a1, b1), a2, b2);
end;
$mig$;

-- ---------------------------------------------------------------- 2c. the wrong reported score
update public.fixtures
   set reported_home_goals = 0, reported_away_goals = 4, reported_at = now(), updated_at = now()
 where fixture_id = 1470
   and reported_home_goals = 2 and reported_away_goals = 0
   and exists (select 1 from public.matches m
                where m.match_id = 204627 and m.full_time_home_goals = 0 and m.full_time_away_goals = 4);

-- ---------------------------------------------------------------- 4a. email-weekly checked per deadline
create or replace function public.check_deadline_runs()
 returns table(check_name text, status text, found bigint, detail text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with d as (
    select g.fpl_event_id, g.deadline_time
      from public.fpl_gameweeks g
     where g.season_id = public.fpl_current_season_id()
       and g.deadline_time < now() and g.deadline_time > now() - interval '8 days'
     order by g.deadline_time desc limit 1
  ),
  -- ok_within / warn_within: how long before the deadline the last success must be.
  -- since / before_since: the grade for a miss on a deadline before this date.
  -- counts: run statuses that count as done ('warning' = a partial email send).
  j(job, label, ok_within, warn_within, since, before_since, counts) as (values
    ('refresh_fpl_projections', 'FPL projections', interval '6 hours', interval '12 hours', timestamptz '2026-10-23 00:00+00', 'warning', array['success']),
    ('ffs_team_news', 'FFS team news', interval '6 hours', interval '12 hours', timestamptz '2026-10-23 00:00+00', 'warning', array['success']),
    -- 2 Nov 2026: the weekly email goes out Thu 18:00 UK for a Fri/Sat deadline, else
    -- 36 h before. First due before the GW10 deadline (6 Nov); nothing to miss before.
    ('email-weekly', 'FPL weekly email', interval '3 days', interval '3 days', timestamptz '2026-11-05 00:00+00', 'ok', array['success', 'warning'])),
  r as (
    select j.job, j.label, j.ok_within, j.warn_within, j.since, j.before_since, d.fpl_event_id, d.deadline_time,
           (select max(p.finished_at) from public.pipeline_runs p
             where p.job_name = j.job and p.status = any (j.counts) and p.finished_at < d.deadline_time) as last_ok
      from j cross join d
  ),
  graded as (
    select r.*,
           case when r.last_ok >= r.deadline_time - r.ok_within then 'ok'
                when r.last_ok >= r.deadline_time - r.warn_within then 'warning'
                when r.deadline_time < r.since then r.before_since
                else 'failed' end as grade
      from r
  ),
  disp as (
    select count(*) filter (where x.n_failed >= s.max_attempts and not x.any_ok) as dead,
           string_agg(x.slot_key || ' ' || to_char(x.due_at at time zone 'UTC', 'DD Mon HH24:MI'), ', ')
             filter (where x.n_failed >= s.max_attempts and not x.any_ok) as names,
           bool_and(s.enabled) as enabled
      from private.workflow_dispatch_settings s
      left join (
        select w.slot_key, w.due_at, count(*) filter (where w.outcome = 'failed') as n_failed, bool_or(w.outcome = 'ok') as any_ok
          from private.workflow_dispatches w
         where w.due_at > now() - interval '2 days'
         group by w.slot_key, w.due_at) x on true
     where s.id
  )
  select 'deadline_run_' || g.job, g.grade,
         coalesce(round(extract(epoch from g.deadline_time - g.last_ok) / 60)::bigint, -1),
         format('Minutes between the last successful %s run and the GW%s deadline %s UTC (last %s; ok within %s, warns within %s; -1 = none)',
                g.label, g.fpl_event_id, to_char(g.deadline_time at time zone 'UTC', 'DD Mon HH24:MI'),
                coalesce(to_char(g.last_ok at time zone 'UTC', 'DD Mon HH24:MI'), 'none'), g.ok_within, g.warn_within)
    from graded g
  union all
  select 'workflow_dispatcher',
         case when not coalesce(disp.enabled, false) then 'warning' when disp.dead > 0 then 'failed' else 'ok' end,
         coalesce(disp.dead, 0),
         case when not coalesce(disp.enabled, false) then 'pg_cron workflow dispatcher is disabled (private.workflow_dispatch_settings)'
              else 'Slots in the last 2 days whose every dispatch attempt failed (private.workflow_dispatches): ' || coalesce(disp.names, 'none') end
    from disp
$function$;

-- ---------------------------------------------------------------- 4b + 5. job registry
update public.job_registry
   set expected_interval = interval '12 hours',
       notes = 'Submits URLs whose sitemap lastmod changed since the last run; summary has counts and HTTP status. Hourly cron, but GitHub throttles scheduled runs (4 runs on 1 Nov, gaps up to 6 h), so stale only after 12 h (2 Nov 2026)'
 where job_key = 'indexnow' and expected_interval is distinct from interval '12 hours';

update public.job_registry
   set expected_interval = null,
       notes = 'The FPL weekly email send (edge function email-weekly via email-weekly-tick). Counts only in pipeline_runs. No fixed interval (it would go stale every summer): timing is checked per FPL deadline by check_deadline_runs (deadline_run_email-weekly); failures still show in job_health; email-weekly-tick has the 3 h liveness limit (2 Nov 2026)'
 where job_key = 'email-weekly' and expected_interval is not null;

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, notes)
values
  ('fpl-deadline-final-call', 'fpl', 'supabase_cron', '* * * * *', interval '10 minutes', interval '00:05:00', 'pg_cron', '^fpl-deadline-final-call$', null,
   'Every minute: private.fpl_deadline_final_call(); no-op except just before an FPL deadline'),
  ('fpl-price-predictor-record', 'fpl', 'supabase_cron', '40 6 * * *', interval '26 hours', interval '00:10:00', 'pg_cron', '^fpl-price-predictor-record$', null,
   'Daily: private.record_fpl_price_predictor() records the price predictor''s calls for later scoring'),
  ('fpl-refresh-late-evening', 'fpl', 'supabase_cron', '47 21 * * *', interval '26 hours', interval '00:10:00', 'pg_cron', '^fpl-refresh-late-evening$', 'fantasy.premierleague.com',
   'Daily 21:47 UTC: private.refresh_fpl() to pick up late team news before the next morning'),
  ('social-lineups', 'social', 'supabase_cron', '*/5 * * * *', interval '30 minutes', interval '00:05:00', 'pg_cron', '^social-lineups$', null,
   'Every 5 minutes: public.social_lineups_tick(); no-op unless a line-up post is due'),
  ('social-x-metrics', 'social', 'supabase_cron', '40 7 * * 1', interval '8 days', interval '00:10:00', 'pg_cron', '^social-x-metrics$', 'api.x.com',
   'Weekly: private.social_metrics_call() fetches X post metrics'),
  ('email-weekly-test', 'email', 'edge_function', 'manual (test send to admins)', null, interval '00:15:00', 'pipeline_runs', '^email-weekly-test$', 'api.resend.com',
   'Manual test sends of the FPL weekly email; not scheduled')
on conflict (job_key) do nothing;

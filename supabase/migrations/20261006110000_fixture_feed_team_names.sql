-- ============================================================================
-- FixtureDownload team names: 47 were never mapped (6 Oct 2026).
--
-- refresh_fixture_feeds() (pg_cron, 04:15 daily) matches the FixtureDownload
-- feeds to our fixtures by team. Names are looked up in team_aliases
-- (source 'FixtureDownload') or as a canonical name, and 47 of the feed's
-- names were in neither: the full names of 16 League One clubs ("Huddersfield
-- Town" for Huddersfield), 16 League Two, 15 Championship, and "Spurs". Every
-- fixture involving one of them was silently skipped, so:
--   * 8 League One games postponed on 26 Sep (and Port Vale v Northampton in
--     League Two) still showed as due on 26 Sep, with no result ever coming;
--   * 230 League One kick-offs stayed in UTC from the original load (15:00
--     shown as 14:00 for every game in British Summer Time);
--   * no reported (provisional) scores for those clubs' games.
-- Found by the 6 Oct audit via the stale_scheduled_fixtures check.
--
-- This adds the aliases, then corrects those League One kick-off times
-- straight from the feed without logging them as "changes" (the games never
-- moved; logging them would put 230 rows on /fixtures/changes). The refresh
-- then runs once at the end, so the genuine date changes (the postponements)
-- are applied today and logged as changes.
-- check_fixture_feed_names() is the guard against the next unmapped name.
-- ============================================================================

insert into public.team_aliases (team_id, source_name, raw_name) values
  (14, 'FixtureDownload', 'Spurs'),
  (34, 'FixtureDownload', 'Birmingham City'),
  (21, 'FixtureDownload', 'Blackburn Rovers'),
  (40, 'FixtureDownload', 'Bolton Wanderers'),
  (22, 'FixtureDownload', 'Cardiff City'),
  (24, 'FixtureDownload', 'Charlton Athletic'),
  (27, 'FixtureDownload', 'Derby County'),
  (107, 'FixtureDownload', 'Lincoln City'),
  (44, 'FixtureDownload', 'Norwich City'),
  (59, 'FixtureDownload', 'Preston North End'),
  (7, 'FixtureDownload', 'Queens Park Rangers'),
  (9, 'FixtureDownload', 'Stoke City'),
  (6, 'FixtureDownload', 'Swansea City'),
  (11, 'FixtureDownload', 'West Bromwich Albion'),
  (13, 'FixtureDownload', 'West Ham United'),
  (43, 'FixtureDownload', 'Wolverhampton Wanderers'),
  (47, 'FixtureDownload', 'Bradford City'),
  (88, 'FixtureDownload', 'Burton Albion'),
  (75, 'FixtureDownload', 'Cambridge United'),
  (68, 'FixtureDownload', 'Doncaster Rovers'),
  (29, 'FixtureDownload', 'Huddersfield Town'),
  (3, 'FixtureDownload', 'Leicester City'),
  (78, 'FixtureDownload', 'Luton Town'),
  (86, 'FixtureDownload', 'Mansfield Town'),
  (55, 'FixtureDownload', 'MK Dons'),
  (87, 'FixtureDownload', 'Oxford United'),
  (62, 'FixtureDownload', 'Peterborough United'),
  (76, 'FixtureDownload', 'Plymouth Argyle'),
  (26, 'FixtureDownload', 'Sheffield Wednesday'),
  (131, 'FixtureDownload', 'Stockport County'),
  (41, 'FixtureDownload', 'Wigan Athletic'),
  (84, 'FixtureDownload', 'Wycombe Wanderers'),
  (69, 'FixtureDownload', 'Accrington Stanley'),
  (97, 'FixtureDownload', 'Bristol Rovers'),
  (74, 'FixtureDownload', 'Cheltenham Town'),
  (49, 'FixtureDownload', 'Colchester United'),
  (52, 'FixtureDownload', 'Crewe Alexandra'),
  (81, 'FixtureDownload', 'Exeter City'),
  (98, 'FixtureDownload', 'Grimsby Town'),
  (85, 'FixtureDownload', 'Northampton Town'),
  (50, 'FixtureDownload', 'Oldham Athletic'),
  (28, 'FixtureDownload', 'Rotherham United'),
  (130, 'FixtureDownload', 'Salford City'),
  (72, 'FixtureDownload', 'Shrewsbury Town'),
  (65, 'FixtureDownload', 'Swindon Town'),
  (91, 'FixtureDownload', 'Tranmere Rovers'),
  (92, 'FixtureDownload', 'York City')
on conflict (source_name, raw_name) do nothing;

-- League One kick-offs stored in UTC (or missing), corrected quietly (same date only).
with feed as (
  select (extensions.http_get('https://fixturedownload.com/feed/json/efl-league-one-' ||
          (select start_year from public.seasons where season_id = public.current_season_id()))).content::jsonb j
),
src as (
  select e->>'HomeTeam' home_raw, e->>'AwayTeam' away_raw, (e->>'DateUtc')::timestamptz ko
  from feed, jsonb_array_elements(feed.j) e where e ? 'DateUtc'
),
mapped as (
  select s.ko, coalesce(ha.team_id, ht.team_id) home_id, coalesce(aa.team_id, at.team_id) away_id
  from src s
  left join public.team_aliases ha on ha.source_name = 'FixtureDownload' and ha.raw_name = s.home_raw
  left join public.teams ht on ht.canonical_name = s.home_raw
  left join public.team_aliases aa on aa.source_name = 'FixtureDownload' and aa.raw_name = s.away_raw
  left join public.teams at on at.canonical_name = s.away_raw
)
update public.fixtures f
   set kickoff_time = (m.ko at time zone 'Europe/London')::time, updated_at = now()
  from mapped m
 where f.league_id = (select league_id from public.leagues where code = 'E2')
   and f.season_id = public.current_season_id()
   and f.home_team_id = m.home_id and f.away_team_id = m.away_id
   and (f.kickoff_time is null or f.kickoff_time = (m.ko at time zone 'UTC')::time)
   and f.kickoff_time is distinct from (m.ko at time zone 'Europe/London')::time
   and f.kickoff_date = (m.ko at time zone 'Europe/London')::date
   and (m.ko at time zone 'UTC')::time <> '00:00';

-- Guard: fixtures in the FixtureDownload leagues that the daily refresh has
-- not touched for 3 days. Every matched fixture is rewritten each run
-- (updated_at = now()), so a stale one means its team name isn't mapped
-- (or the feed dropped it).
create or replace function public.check_fixture_feed_names()
 returns table(check_name text, status text, found bigint, detail text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select 'fixture_feed_names_mapped',
    case when count(*) = 0 then 'ok' else 'failed' end,
    count(*),
    'Current-season E0-E3 fixtures not refreshed by the FixtureDownload feed for 3+ days (an unmapped team name in team_aliases?): '
      || coalesce(array_to_string((array_agg(l.code || ' ' || ht.canonical_name || ' v ' || at.canonical_name order by f.kickoff_date))[1:10], ', '), '')
  from public.fixtures f
  join public.leagues l on l.league_id = f.league_id
  join public.teams ht on ht.team_id = f.home_team_id
  join public.teams at on at.team_id = f.away_team_id
  where l.code in ('E0', 'E1', 'E2', 'E3')
    and f.season_id = public.current_season_id()
    and f.updated_at < now() - interval '3 days'
$function$;
revoke all on function public.check_fixture_feed_names() from public, anon, authenticated;
grant execute on function public.check_fixture_feed_names() to service_role;

-- Apply the feeds now rather than at 04:15 tomorrow.
select public.refresh_fixture_feeds();

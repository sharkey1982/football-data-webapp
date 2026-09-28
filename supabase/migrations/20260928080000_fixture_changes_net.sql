-- ============================================================================
-- Fixture changes: net of flip-flops, for a dedicated page.
--
-- The fixture feed sometimes reverts a kick-off to its placeholder slot and
-- restores it a day or two later (e.g. 25 Sep 2026: 17 Premier League
-- fixtures moved back to Saturday 15:00 at 04:15, then back again on
-- 27 Sep). Each hop was logged in fixture_changes and shown as a banner, so
-- one real TV-pick change could notify three times, and pages carried a
-- banner that came back on every visit.
--
-- fixture_changes_net: per fixture with any change in the last 30 days, the
-- kick-off before its first change in that window against its kick-off now.
-- A fixture that ended where it started is left out. The raw log stays in
-- fixture_changes, untouched.
-- ============================================================================

create or replace view public.fixture_changes_net with (security_invoker = true) as
with w as (
  select c.*, row_number() over (partition by c.fixture_id order by c.detected_at, c.change_id) as rn,
    count(*) over (partition by c.fixture_id) as hops,
    max(c.detected_at) over (partition by c.fixture_id) as last_detected
  from public.fixture_changes c
  where c.detected_at > now() - interval '30 days'
)
select f.fixture_id, f.slug, f.league_id, l.code as league_code, l.name as league_name,
  ht.display_name as home_team_name, at.display_name as away_team_name,
  w.old_kickoff_date as was_date, w.old_kickoff_time as was_time,
  f.kickoff_date as now_date, f.kickoff_time as now_time, f.status,
  w.hops::int as changes_logged, w.last_detected as changed_at
from w
join public.fixtures f on f.fixture_id = w.fixture_id
join public.leagues l on l.league_id = f.league_id
join public.teams ht on ht.team_id = f.home_team_id
join public.teams at on at.team_id = f.away_team_id
where w.rn = 1
  and (w.old_kickoff_date is distinct from f.kickoff_date or w.old_kickoff_time is distinct from f.kickoff_time);

grant select on public.fixture_changes_net to anon, authenticated;

select public.meta_refresh_flow();

update public.meta_flow_nodes set layer = 'api', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'Fixture kick-off changes in the last 30 days, net of flip-flops: per fixture, the kick-off before its first logged change in the window against its kick-off now; fixtures that ended where they started are left out. Powers /fixtures/changes and the one-line notice on the Fixtures and gameweek pages.',
  refresh_note = 'View over fixture_changes and fixtures.', purpose_reviewed_at = now()
where node_key = 'object:fixture_changes_net';

-- ============================================================================
-- Reported scores: keep the score the fixture feeds already publish, until
-- football-data confirms it.
--
-- Between kick-off and football-data's update (hours for the Premier League,
-- up to three days for the National League) a played fixture had no score,
-- so club pages dropped it from both "upcoming" and "results". Both feeds
-- carry the final score (footballwebpages for the National League,
-- fixturedownload for the Premier League to League Two), and it was
-- discarded.
--
-- * fixtures.reported_home_goals / reported_away_goals / reported_at /
--   reported_source: the feed's score. Shown as provisional; NEVER read by
--   league tables, the model or the history layer, which use matches only.
-- * refresh_national_league_fixtures() and refresh_fixture_feeds() store it.
-- * fixtures_reported_unconfirmed: played fixtures with a reported score and
--   no result in matches yet (the league table lists them under the table).
-- * check_model_integrity(): 'reported_vs_confirmed' warns when a reported
--   score disagrees with football-data's -- a cross-check between sources.
-- ============================================================================

alter table public.fixtures
  add column if not exists reported_home_goals int,
  add column if not exists reported_away_goals int,
  add column if not exists reported_at timestamptz,
  add column if not exists reported_source text;

comment on column public.fixtures.reported_home_goals is
  'Final score as published by the fixture feed (reported_source), before football-data confirms it in matches. Provisional: display only, never used by tables, the model or history.';

-- National League (footballwebpages): after new fixtures are inserted.
do $$
declare
  v_def text;
  v_anchor text := 'get diagnostics v_inserted = row_count;';
begin
  select pg_get_functiondef('public.refresh_national_league_fixtures()'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'refresh_national_league_fixtures anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor, v_anchor || $add$

    -- Reported score (display only until football-data confirms it).
    update public.fixtures f set
      reported_home_goals = e.hg, reported_away_goals = e.ag,
      reported_at = now(), reported_source = 'FootballWebPages'
    from _ec e
    where f.league_id = v_league and f.season_id = v_season
      and f.home_team_id = e.home_id and f.away_team_id = e.away_id
      and e.hg is not null and e.ag is not null
      and (f.reported_home_goals is distinct from e.hg or f.reported_away_goals is distinct from e.ag);$add$);
end $$;

-- Premier League to League Two, Bundesliga and UEFA (fixturedownload): after
-- each feed's fixture update, which has just set kickoff_date from the feed.
do $$
declare
  v_def text;
  v_anchor text := 'get diagnostics v_count=row_count; v_updated:=v_updated+v_count;';
begin
  select pg_get_functiondef('public.refresh_fixture_feeds()'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'refresh_fixture_feeds anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor, v_anchor || $add$
  -- Reported score (display only until football-data confirms it).
  with src as (select elem->>'HomeTeam' home_raw, elem->>'AwayTeam' away_raw, (elem->>'DateUtc')::timestamptz ko,
                      nullif(elem->>'HomeTeamScore','')::int hg, nullif(elem->>'AwayTeamScore','')::int ag
               from jsonb_array_elements(v_json) elem where elem ? 'DateUtc'),
  mapped as (select s.*, coalesce(ha.team_id, ht.team_id) home_id, coalesce(aa.team_id, at.team_id) away_id
             from src s
             left join public.team_aliases ha on ha.source_name = 'FixtureDownload' and ha.raw_name = s.home_raw
             left join public.teams ht on ht.canonical_name = s.home_raw
             left join public.team_aliases aa on aa.source_name = 'FixtureDownload' and aa.raw_name = s.away_raw
             left join public.teams at on at.canonical_name = s.away_raw)
  update public.fixtures f set reported_home_goals = m.hg, reported_away_goals = m.ag,
    reported_at = now(), reported_source = 'FixtureDownload'
  from mapped m
  where m.ko < now() and m.hg is not null and m.ag is not null and m.home_id is not null and m.away_id is not null
    and f.league_id = v_league_id and f.season_id = v_season_id
    and f.home_team_id = m.home_id and f.away_team_id = m.away_id
    and f.kickoff_date = (m.ko at time zone 'Europe/London')::date
    and (f.reported_home_goals is distinct from m.hg or f.reported_away_goals is distinct from m.ag);$add$);
end $$;

-- Played, reported, not yet confirmed. Matched to matches by pairing within
-- the season, not by date, so a date correction cannot hide a confirmation.
create or replace view public.fixtures_reported_unconfirmed with (security_invoker = true) as
select f.fixture_id, f.slug, f.league_id, f.season_id, f.kickoff_date, f.home_team_id, f.away_team_id,
  f.reported_home_goals, f.reported_away_goals, f.reported_at, f.reported_source
from public.fixtures f
where f.status = 'played'
  and f.reported_home_goals is not null and f.reported_away_goals is not null
  and not exists (
    select 1 from public.matches m
    where m.league_id = f.league_id and m.season_id = f.season_id
      and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
      and m.match_date between f.kickoff_date - 3 and f.kickoff_date + 3
      and m.full_time_home_goals is not null);

grant select on public.fixtures_reported_unconfirmed to anon, authenticated;

-- Cross-check between sources.
do $$
declare
  v_def text;
  v_anchor text := '-- Catalogue (2026-09-26)';
  v_add text := $add$-- Reported scores (2026-09-27): the fixture feed's score must match
  -- football-data's once both exist. A difference is a scraping, mapping or
  -- source error in one of them.
  select 'reported_vs_confirmed', case when n = 0 then 'ok' else 'warning' end, n,
    'Fixtures whose reported (feed) score differs from the confirmed result in matches: ' || coalesce(names, '')
  from (select count(*) n, string_agg(f.fixture_id || ' ' || f.reported_home_goals || '-' || f.reported_away_goals
                                      || ' v ' || m.full_time_home_goals || '-' || m.full_time_away_goals, ', ')
                                      filter (where rn <= 10) names
        from (select f.*, row_number() over (order by f.kickoff_date desc) rn from public.fixtures f
              where f.reported_home_goals is not null) f
        join public.matches m on m.league_id = f.league_id and m.season_id = f.season_id
          and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
          and m.match_date between f.kickoff_date - 3 and f.kickoff_date + 3
        where m.full_time_home_goals is not null
          and (m.full_time_home_goals <> f.reported_home_goals or m.full_time_away_goals <> f.reported_away_goals)) x
  union all
  $add$;
begin
  select pg_get_functiondef('public.check_model_integrity'::regproc) into v_def;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'check_model_integrity anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor, v_add || v_anchor);
end $$;

-- Catalogue.
select public.meta_refresh_flow();

update public.meta_flow_nodes set
  layer = 'pipeline', status = 'current', is_public = true, ai_relevant = false,
  purpose = 'Played fixtures with a score reported by the fixture feed (fixtures.reported_*) and no confirmed result in matches yet (paired within the season, +/- 3 days). Display only: the league table lists them as reported, not counted. Security invoker view.',
  refresh_note = 'View; reported scores are written by refresh_fixture_feeds() (04:15 UTC) and refresh_national_league_fixtures() (04:35 UTC).',
  purpose_reviewed_at = now()
where node_key = 'object:fixtures_reported_unconfirmed';

update public.meta_flow_nodes set purpose_reviewed_at = now()
where node_key in ('function:check_model_integrity()', 'function:refresh_fixture_feeds()',
                   'function:refresh_national_league_fixtures()', 'object:fixtures');

update public.meta_flow_nodes set
  purpose = replace(purpose, 'a row from another source is never overwritten.', 'a row from another source is never overwritten. For every feed, a played fixture''s feed score is stored in fixtures.reported_* (display only until football-data confirms it; check_model_integrity ''reported_vs_confirmed'' compares the two).'),
  purpose_reviewed_at = now()
where node_key = 'function:refresh_fixture_feeds()';

update public.meta_flow_nodes set
  purpose = replace(purpose, 'marks played and postponed fixtures, inserts missing ones.', 'marks played and postponed fixtures, inserts missing ones, and stores the published score in fixtures.reported_* (display only until football-data confirms it).'),
  purpose_reviewed_at = now()
where node_key = 'function:refresh_national_league_fixtures()';

update public.meta_flow_nodes set
  purpose = replace(purpose, 'there are no score columns (results are in matches);', 'confirmed results are in matches; reported_home/away_goals, reported_at and reported_source hold the fixture feed''s score before confirmation, for display only (never tables, model or history);'),
  purpose_reviewed_at = now()
where node_key = 'object:fixtures';

update public.meta_flow_nodes set purpose_reviewed_at = now()
where node_key = 'function:check_model_integrity()';

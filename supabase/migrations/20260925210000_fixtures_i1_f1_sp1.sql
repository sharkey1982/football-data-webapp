-- Upcoming fixtures for Serie A, Ligue 1 and La Liga (so Airtable UK
-- broadcast records for them can be matched). Applied live 25 Sep 2026.
--
-- One-off data load (already run): 2026/27 from fixturedownload.com
-- serie-a-2026 (380), ligue-1-2026 (306), la-liga-2026 (380). Played counts
-- matched results already in matches (I1 50, F1 45, SP1 69). FixtureDownload
-- aliases added for 33 club names, plus Airtable aliases for 18 variants
-- (Tottenham Hotspur, PSG, MK Dons, Atlético Madrid, Beşiktaş, ...).
--
-- Why a generic nearest-date matcher: the Ligue 1 feed lists Rennes v PSG
-- twice (rounds 1 and 23 -- a source error), which broke refresh_fixture_
-- feeds' pair-only UPDATE (fixtures_natural_key_unique; rolled back, leagues
-- removed from the loop within minutes, no failed daily run). Ligue 1 also
-- uses midnight CET (23:00Z) as its unscheduled placeholder, not 00:00Z.
-- refresh_feed_nearest_date() handles both; Scotland's function now wraps it.

create or replace function public.refresh_feed_nearest_date(p_code text, p_url text)
returns integer
language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_catalog'
as $function$
declare
  v_league bigint; v_season bigint; v_status int; v_body text; v_changed int := 0; v_n int;
begin
  select league_id into v_league from public.leagues where code = p_code;
  select season_id into v_season from public.seasons where label = '2627';
  if v_league is null or v_season is null then return 0; end if;
  select status, content into v_status, v_body from extensions.http_get(p_url);
  if v_status <> 200 then raise exception '% feed returned HTTP %', p_code, v_status; end if;

  drop table if exists _feed, _feed_match;
  create temp table _feed on commit drop as
  select coalesce(ha.team_id, ht.team_id) home_id, coalesce(aa.team_id, at.team_id) away_id,
    x.ko,
    case when (x.ko at time zone 'UTC')::time = '00:00' or (x.ko at time zone 'Europe/Paris')::time = '00:00'
         then (x.ko at time zone 'Europe/Paris')::date else (x.ko at time zone 'Europe/London')::date end ko_date,
    case when (x.ko at time zone 'UTC')::time = '00:00' or (x.ko at time zone 'Europe/Paris')::time = '00:00'
         then null else (x.ko at time zone 'Europe/London')::time end ko_time,
    x.rnd
  from (select e->>'HomeTeam' h, e->>'AwayTeam' a, (e->>'DateUtc')::timestamptz ko,
          nullif(regexp_replace(coalesce(e->>'RoundNumber',''),'[^0-9]','','g'),'')::int rnd
        from jsonb_array_elements(v_body::jsonb) e where e ? 'DateUtc') x
  left join public.team_aliases ha on ha.source_name='FixtureDownload' and ha.raw_name=x.h
  left join public.teams ht on ht.canonical_name=x.h
  left join public.team_aliases aa on aa.source_name='FixtureDownload' and aa.raw_name=x.a
  left join public.teams at on at.canonical_name=x.a;
  delete from _feed where home_id is null or away_id is null or ko is null;

  create temp table _feed_match on commit drop as
  select distinct on (f.fixture_id) f.fixture_id, s.ko, s.ko_date, s.ko_time, s.rnd
  from _feed s
  join public.fixtures f on f.league_id = v_league and f.season_id = v_season
    and f.home_team_id = s.home_id and f.away_team_id = s.away_id
    and abs(f.kickoff_date - s.ko_date) <= 60
  order by f.fixture_id, abs(f.kickoff_date - s.ko_date);

  insert into public.fixture_changes(fixture_id, old_kickoff_date, new_kickoff_date, old_kickoff_time, new_kickoff_time)
  select f.fixture_id, f.kickoff_date, m.ko_date, f.kickoff_time, m.ko_time
  from _feed_match m join public.fixtures f on f.fixture_id = m.fixture_id
  where f.kickoff_date <> m.ko_date or f.kickoff_time is distinct from m.ko_time;

  update public.fixtures f set
    kickoff_date = m.ko_date, kickoff_time = m.ko_time, matchweek = coalesce(m.rnd, f.matchweek),
    status = case when m.ko < now() then 'played' else 'scheduled' end, updated_at = now()
  from _feed_match m
  where f.fixture_id = m.fixture_id
    and (f.kickoff_date <> m.ko_date or f.kickoff_time is distinct from m.ko_time
      or f.status <> case when m.ko < now() then 'played' else 'scheduled' end);
  get diagnostics v_n = row_count; v_changed := v_changed + v_n;

  insert into public.fixtures (league_id, season_id, home_team_id, away_team_id, kickoff_date, kickoff_time, matchweek, status, source_name, source_file)
  select v_league, v_season, s.home_id, s.away_id, s.ko_date, s.ko_time, s.rnd,
    case when s.ko < now() then 'played' else 'scheduled' end, 'FixtureDownload', p_url
  from _feed s
  where not exists (
    select 1 from public.fixtures f where f.league_id = v_league and f.season_id = v_season
      and f.home_team_id = s.home_id and f.away_team_id = s.away_id
      and abs(f.kickoff_date - s.ko_date) <= 60)
  on conflict (league_id, season_id, kickoff_date, home_team_id, away_team_id) do nothing;
  get diagnostics v_n = row_count; v_changed := v_changed + v_n;
  return v_changed;
end;
$function$;
revoke all on function public.refresh_feed_nearest_date(text, text) from public, anon, authenticated;

create or replace function public.refresh_scottish_premiership_fixtures()
returns integer language sql security definer set search_path to 'public', 'pg_catalog' as $$
  select public.refresh_feed_nearest_date('SC0', 'https://fixturedownload.com/feed/json/scottish-premiership-2026');
$$;
revoke all on function public.refresh_scottish_premiership_fixtures() from public, anon, authenticated;

-- Add I1/F1/SP1 to refresh_fixture_feeds, each isolated like Scotland.
do $$
declare d text := pg_get_functiondef('public.refresh_fixture_feeds'::regproc);
begin
  if position('ligue-1-2026' in d) > 0 then return; end if;
  d := replace(d, $a$ begin perform public.refresh_scottish_premiership_fixtures();
 exception when others then raise warning 'SC0 fixture refresh failed: %', sqlerrm; end;$a$,
$a$ begin perform public.refresh_scottish_premiership_fixtures();
 exception when others then raise warning 'SC0 fixture refresh failed: %', sqlerrm; end;
 -- Serie A, Ligue 1, La Liga use the nearest-date matcher too (the feed
 -- can list a pairing twice); each isolated like Scotland.
 begin perform public.refresh_feed_nearest_date('I1','https://fixturedownload.com/feed/json/serie-a-2026');
 exception when others then raise warning 'I1 fixture refresh failed: %', sqlerrm; end;
 begin perform public.refresh_feed_nearest_date('F1','https://fixturedownload.com/feed/json/ligue-1-2026');
 exception when others then raise warning 'F1 fixture refresh failed: %', sqlerrm; end;
 begin perform public.refresh_feed_nearest_date('SP1','https://fixturedownload.com/feed/json/la-liga-2026');
 exception when others then raise warning 'SP1 fixture refresh failed: %', sqlerrm; end;$a$);
  if position('ligue-1-2026' in d) = 0 then raise exception 'refresh_fixture_feeds hook not applied'; end if;
  execute d;
end $$;

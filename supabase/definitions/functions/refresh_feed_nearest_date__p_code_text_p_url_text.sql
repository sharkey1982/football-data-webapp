-- Live definition exported from the database (function refresh_feed_nearest_date(p_code text, p_url text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_feed_nearest_date(p_code text, p_url text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
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
$function$
;

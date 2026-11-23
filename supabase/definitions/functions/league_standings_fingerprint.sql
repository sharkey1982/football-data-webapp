-- Live definition exported from the database (function league_standings_fingerprint()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.league_standings_fingerprint()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select md5(concat_ws('|',
    (select count(*) || ':' || coalesce(max(m.updated_at)::text, '') || ':' ||
            coalesce(sum(hashint8(m.match_id) # hashint8(m.home_team_id * 1000003 + m.away_team_id)
                # hashint4(coalesce(m.full_time_home_goals, -1) * 101 + coalesce(m.full_time_away_goals, -1))
                # hashint4((m.match_date - date '1900-01-01')::int)
                # hashint8(m.league_id * 10007 + m.season_id)
                # hashint8(coalesce(extract(epoch from m.kickoff_time)::bigint, -1))
                # hashtext(coalesce(m.stage, '') || '/' || coalesce(m.decided_by, '') || '/' || coalesce(m.winner_team_id::text, '')))::text, '')
       from public.matches m),
    (select md5(coalesce(string_agg(x::text, ',' order by x::text), '')) from public.point_deductions x),
    (select md5(coalesce(string_agg(x::text, ',' order by x::text), '')) from public.league_season_formats x),
    (select md5(coalesce(string_agg(x::text, ',' order by x::text), '')) from public.leagues x),
    (select md5(coalesce(string_agg(x::text, ',' order by x::text), '')) from public.seasons x),
    (select md5(coalesce(string_agg(t.team_id || ':' || t.canonical_name, ',' order by t.team_id), '')) from public.teams t)))
$function$
;

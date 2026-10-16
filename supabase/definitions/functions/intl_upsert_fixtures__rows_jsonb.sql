-- Live definition exported from the database (function intl_upsert_fixtures(rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.intl_upsert_fixtures(rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  insert into intl.fixtures as f (fixture_key, edition_key, kickoff_utc, home_team, away_team, group_label,
    round_number, venue, home_score, away_score, source, raw, updated_at)
  select r->>'fixture_key', r->>'edition_key', (r->>'kickoff_utc')::timestamptz, r->>'home_team', r->>'away_team',
    r->>'group_label', (r->>'round_number')::int, r->>'venue', (r->>'home_score')::int, (r->>'away_score')::int,
    r->>'source', r->'raw', now()
  from jsonb_array_elements(rows) r
  on conflict (fixture_key) do update set kickoff_utc = excluded.kickoff_utc, home_team = excluded.home_team,
    away_team = excluded.away_team, group_label = excluded.group_label, round_number = excluded.round_number,
    venue = excluded.venue,
    -- never let the feed blank a score it once carried
    home_score = coalesce(excluded.home_score, f.home_score), away_score = coalesce(excluded.away_score, f.away_score),
    raw = excluded.raw, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $function$
;

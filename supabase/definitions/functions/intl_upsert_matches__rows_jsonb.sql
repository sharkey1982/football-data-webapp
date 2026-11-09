-- Live definition exported from the database (function intl_upsert_matches(rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.intl_upsert_matches(rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  insert into intl.matches as m (match_key, match_date, home_team, away_team, home_score, away_score, competition,
    city, country, neutral, edition_key, stage_code, group_label, matchday, home_score_90, away_score_90,
    went_extra_time, shootout_winner, elo_home_pre, elo_away_pre, elo_change, raw, imported_at)
  select r->>'match_key', (r->>'match_date')::date, r->>'home_team', r->>'away_team',
    (r->>'home_score')::int, (r->>'away_score')::int, r->>'competition', r->>'city', r->>'country',
    (r->>'neutral')::boolean, r->>'edition_key', r->>'stage_code', r->>'group_label', (r->>'matchday')::int,
    (r->>'home_score_90')::int, (r->>'away_score_90')::int, (r->>'went_extra_time')::boolean,
    r->>'shootout_winner', (r->>'elo_home_pre')::numeric, (r->>'elo_away_pre')::numeric,
    (r->>'elo_change')::numeric, r->'raw', now()
  from jsonb_array_elements(rows) r
  on conflict (match_key) do update set
    match_date = excluded.match_date, home_team = excluded.home_team, away_team = excluded.away_team,
    home_score = excluded.home_score, away_score = excluded.away_score, competition = excluded.competition,
    city = excluded.city, country = excluded.country, neutral = excluded.neutral,
    edition_key = excluded.edition_key, stage_code = excluded.stage_code, group_label = excluded.group_label,
    matchday = excluded.matchday, home_score_90 = excluded.home_score_90, away_score_90 = excluded.away_score_90,
    went_extra_time = excluded.went_extra_time, shootout_winner = excluded.shootout_winner,
    elo_home_pre = excluded.elo_home_pre, elo_away_pre = excluded.elo_away_pre, elo_change = excluded.elo_change,
    raw = excluded.raw, imported_at = now()
  where m.raw is distinct from excluded.raw or m.edition_key is distinct from excluded.edition_key
     or m.stage_code is distinct from excluded.stage_code or m.group_label is distinct from excluded.group_label
     or m.home_score_90 is distinct from excluded.home_score_90 or m.elo_change is distinct from excluded.elo_change
     or m.elo_home_pre is distinct from excluded.elo_home_pre or m.shootout_winner is distinct from excluded.shootout_winner;
  get diagnostics n = row_count;
  return n;
end $function$
;

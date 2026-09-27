-- ============================================================================
-- get_countries_by_relevance(): one pass over matches instead of one per team
--
-- The European history load (docs/history-backfill.md, "European leagues")
-- added ~46,000 matches and 154 teams. This function (the site's Country
-- filter, called by anon) counted each team's matches with a correlated
-- EXISTS on home_team_id OR away_team_id, which no index serves, so it
-- scanned matches once per team: ~2.3s before the load, 13.6s after --
-- over the API's 8-second statement timeout.
--
-- Fix: join teams to the distinct set of team ids that appear in matches
-- (one scan). Same output, proved identical (md5 of every row) before the
-- change; ~0.1s. Anchored replacement on the live body; asserts each anchor
-- matches once.
-- ============================================================================

do $$
declare
  def text := pg_get_functiondef('public.get_countries_by_relevance()'::regprocedure);
  a1 text := E'count(distinct t.team_id) filter (where exists (\n      select 1 from matches m where m.home_team_id = t.team_id or m.away_team_id = t.team_id\n    ))';
  r1 text := E'-- one pass over matches (a per-team EXISTS on home OR away scanned\n    -- matches once per team: 13.6s after the European history load)\n    count(distinct t.team_id) filter (where p.team_id is not null)';
  a2 text := E'left join teams t on t.country_id = c.country_id\n';
  r2 text := E'left join teams t on t.country_id = c.country_id\n  left join (select home_team_id as team_id from matches\n             union select away_team_id from matches) p on p.team_id = t.team_id\n';
  n int;
begin
  if position('one pass over matches' in def) > 0 then
    raise notice 'already applied';
    return;
  end if;
  n := (length(def) - length(replace(def, a1, ''))) / length(a1);
  if n <> 1 then raise exception 'anchor 1 matched % times, expected 1', n; end if;
  n := (length(def) - length(replace(def, a2, ''))) / length(a2);
  if n <> 1 then raise exception 'anchor 2 matched % times, expected 1', n; end if;
  execute replace(replace(def, a1, r1), a2, r2);
end $$;

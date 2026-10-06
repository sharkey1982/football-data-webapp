-- Tennis Your Player: the ranking at each player's latest match (Chris, 6 Oct
-- 2026: "world ranking ... in the tables and for filtering and sorting").
-- tennis.player_ratings (surface 'All') already holds latest_rank, kept by
-- rebuild_ratings() every two hours. This appends two columns to
-- public.tennis_players; the existing columns are unchanged, so it is safe to
-- re-run. The rank is the official ATP/WTA ranking on the day of the player's
-- last tour-level match in the data, not this week's list.

grant usage on schema tennis to anon, authenticated;
grant select on tennis.player_ratings to anon, authenticated;

create or replace view public.tennis_players with (security_invoker = true) as
select p.player_id, p.tour, p.name, p.slug,
  t.matches, t.wins, t.first_match, t.last_match, t.won, t.lost, t.titles, t.finals,
  t.first_year, t.last_year, t.recent_matches,
  pp.country, pp.full_name, pp.birth_date, pp.hand, pp.wikidata_qid, t.best_rank, t.best_rank_date,
  r.latest_rank, r.last_match as latest_rank_date
from tennis.players p
join tennis.player_totals t using (player_id)
left join tennis.player_people pp using (player_id)
left join tennis.player_ratings r on r.player_id = p.player_id and r.surface = 'All';

grant select on public.tennis_players to anon, authenticated;

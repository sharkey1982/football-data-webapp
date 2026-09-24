-- First step of a trial La Liga (Spain top flight) ingestion. Spain already
-- existed as country_id=5 (from continental-cup team data) and the leagues
-- table is already fully generic (country_id, competition_type, scope,
-- confederation, tier) -- no schema changes needed for a new country, just
-- this row. No matches reference this league yet, so it's a no-op for every
-- existing view (league_standings, team_season_movement etc. all still
-- filter league_id between 1 and 5). See OUTSTANDING.md for what's next.
insert into leagues (country_id, code, name, tier, competition_type, scope, slug)
values (5, 'SP1', 'La Liga', 1, 'league', 'domestic', 'la-liga');

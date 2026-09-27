-- ============================================================================
-- Scoreline Explorer: how often each scoreline happens in a league, for any
-- span of seasons, optionally from one club's point of view (home, away or
-- both). Goals are capped at 5 ("5" means 5 or more). Reads
-- team_match_snapshot: with no club, the home side's row of each match.
-- ============================================================================

create or replace function public.history_scorelines(
  p_league_id bigint,
  p_from_year int default null,
  p_to_year int default null,
  p_team_id bigint default null,
  p_venue text default null
)
returns table (goals_a int, goals_b int, matches bigint)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  select least(s.goals_for, 5), least(s.goals_against, 5), count(*)
  from public.team_match_snapshot s
  join public.seasons se using (season_id)
  where s.league_id = p_league_id
    and (p_from_year is null or se.start_year >= p_from_year)
    and (p_to_year is null or se.start_year <= p_to_year)
    and case
          when p_team_id is null then s.venue = 'H'
          else s.team_id = p_team_id and (p_venue is null or s.venue = p_venue)
        end
  group by 1, 2
  order by 1, 2;
$function$;

grant execute on function public.history_scorelines(bigint, int, int, bigint, text) to anon, authenticated;

select public.meta_refresh_flow();

update public.meta_flow_nodes set
  layer = 'model', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'Scoreline Explorer: counts of each scoreline (goals capped at 5 = 5 or more) in one league, optionally for a span of start years and from one club''s point of view (goals_a = its goals; p_venue H or A). With no club, goals_a is the home side''s. From team_match_snapshot. Read-only, security invoker, granted to anon. Powers /football/history/scorelines.',
  refresh_note = 'Reads team_match_snapshot; no state of its own.',
  purpose_reviewed_at = now()
where node_key = 'function:history_scorelines(p_league_id bigint, p_from_year integer, p_to_year integer, p_team_id bigint, p_venue text)';

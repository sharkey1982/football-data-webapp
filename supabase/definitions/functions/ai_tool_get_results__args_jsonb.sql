-- Live definition exported from the database (function ai_tool_get_results(args jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_tool_get_results(args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t jsonb; o jsonb; c jsonb; tid bigint; oid_ bigint; lid bigint; sid bigint;
  lim int := least(coalesce((args->>'limit')::int, 10), 50);
  venue text := coalesce(args->>'venue', 'any');
begin
  if args ? 'team' then t := public.ai_resolve_team(args->>'team'); if t ? 'error' then return t; end if; tid := (t->>'team_id')::bigint; end if;
  if args ? 'opponent' then o := public.ai_resolve_team(args->>'opponent'); if o ? 'error' then return o; end if; oid_ := (o->>'team_id')::bigint; end if;
  if args ? 'competition' then c := public.ai_resolve_competition(args->>'competition'); if c ? 'error' then return c; end if; lid := (c->>'league_id')::bigint; end if;
  if tid is null and lid is null then return jsonb_build_object('error', 'Give a team, a competition, or both.'); end if;
  if args ? 'season' then
    if lid is null then return jsonb_build_object('error', 'season needs a competition'); end if;
    sid := public.ai_resolve_season(lid, args->>'season');
    if sid is null then return jsonb_build_object('error', 'Unknown season "' || (args->>'season') || '".'); end if;
  end if;
  return jsonb_build_object('tool', 'get_results', 'source', jsonb_build_array('matches', 'teams', 'leagues', 'seasons'),
    'as_of', now(), 'kind', 'observed', 'note', 'Most recent first. HT = half time.',
    'rows', coalesce((select jsonb_agg(r) from (
      select m.match_date, l.name competition, public.ai_season_label(m.season_id) season,
             h.display_name home_team, a.display_name away_team,
             m.full_time_home_goals home_goals, m.full_time_away_goals away_goals,
             m.half_time_home_goals ht_home, m.half_time_away_goals ht_away, m.decided_by
        from matches m join leagues l using (league_id)
        join teams h on h.team_id = m.home_team_id join teams a on a.team_id = m.away_team_id
       where m.full_time_home_goals is not null
         and (tid is null or (venue = 'home' and m.home_team_id = tid) or (venue = 'away' and m.away_team_id = tid)
              or (venue = 'any' and tid in (m.home_team_id, m.away_team_id)))
         and (oid_ is null or oid_ in (m.home_team_id, m.away_team_id))
         and (lid is null or m.league_id = lid)
         and (sid is null or m.season_id = sid)
       order by m.match_date desc limit lim) r), '[]'::jsonb));
end $function$
;

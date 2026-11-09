-- Live definition exported from the database (function ai_tool_get_league_table(args jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_tool_get_league_table(args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c jsonb; lid bigint; sid bigint;
begin
  if not args ? 'competition' then return jsonb_build_object('error', 'competition is required'); end if;
  c := public.ai_resolve_competition(args->>'competition'); if c ? 'error' then return c; end if;
  lid := (c->>'league_id')::bigint;
  sid := public.ai_resolve_season(lid, args->>'season');
  if sid is null then return jsonb_build_object('error', 'Unknown season.'); end if;
  return jsonb_build_object('tool', 'get_league_table', 'source', jsonb_build_array('league_standings', 'point_deductions', 'league_season_formats'),
    'as_of', now(), 'kind', 'observed', 'competition', c->>'competition', 'season', public.ai_season_label(sid),
    'note', 'points already include any deduction (shown in deduction) and, in split formats, any halving of regular-season points (split_adjustment, negative). split_group 1 is the championship group: after the split, groups are locked, so a club in group 1 ranks above every club in group 2 whatever the points. European play-off ties are not in the table. Sorted by position.',
    'rows', coalesce((select jsonb_agg(r) from (
      select s.position, t.display_name team, s.played, s.won, s.drawn, s.lost, s.goals_for, s.goals_against,
             s.goals_for - s.goals_against goal_difference, s.deduction, s.split_adjustment, s.split_group, s.points,
             s.home_won || '-' || s.home_drawn || '-' || s.home_lost home_wdl,
             s.away_won || '-' || s.away_drawn || '-' || s.away_lost away_wdl
        from league_standings s join teams t using (team_id)
       where s.league_id = lid and s.season_id = sid
       order by s.position) r), '[]'::jsonb));
end $function$
;

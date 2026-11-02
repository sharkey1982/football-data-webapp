-- Live definition exported from the database (function ai_resolve_fpl_player(p_name text, p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_resolve_fpl_player(p_name text, p_season_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with q as (select trim(public.ai_norm(p_name)) n),
  cand as (
    select p.fpl_player_id, p.web_name, p.first_name || ' ' || p.second_name full_name, t.display_name team, 1 rank
      from fpl_players p left join teams t on t.team_id = p.canonical_team_id, q
     where p.season_id = p_season_id
       and (trim(public.ai_norm(p.web_name)) = q.n or trim(public.ai_norm(p.first_name || ' ' || p.second_name)) = q.n)
    union
    select p.fpl_player_id, p.web_name, p.first_name || ' ' || p.second_name, t.display_name, 2
      from fpl_players p left join teams t on t.team_id = p.canonical_team_id, q
     where p.season_id = p_season_id and length(q.n) >= 3
       and (public.ai_norm(p.second_name) like '%' || q.n || '%' or public.ai_norm(p.web_name) like '%' || q.n || '%'
            or public.ai_norm(p.first_name || ' ' || p.second_name) like '%' || q.n || '%')
  ),
  best as (select distinct on (fpl_player_id) * from cand where rank = (select min(rank) from cand) order by fpl_player_id, rank)
  select case
    when (select count(*) from best) = 1 then (select jsonb_build_object('fpl_player_id', fpl_player_id, 'player', web_name, 'full_name', full_name, 'team', team) from best)
    when (select count(*) from best) = 0 then jsonb_build_object('error', 'No FPL player matches "' || p_name || '" in ' || coalesce(public.ai_season_label(p_season_id), 'that season') || '.')
    else jsonb_build_object('error', 'More than one FPL player matches "' || p_name || '".',
                            'candidates', (select jsonb_agg(jsonb_build_object('player', web_name, 'full_name', full_name, 'team', team)) from best))
  end
$function$
;

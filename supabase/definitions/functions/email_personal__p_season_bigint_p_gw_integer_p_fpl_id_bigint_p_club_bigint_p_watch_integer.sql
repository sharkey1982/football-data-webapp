-- Live definition exported from the database (function email_personal(p_season bigint, p_gw integer, p_fpl_id bigint, p_club bigint, p_watch integer[])).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_personal(p_season bigint, p_gw integer, p_fpl_id bigint, p_club bigint, p_watch integer[] DEFAULT NULL::integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pick_gw integer; v_picks integer[]; v_sections jsonb; v_club jsonb; c jsonb; v_last jsonb;
  v_watch integer[] := case when cardinality(p_watch) > 0 then p_watch end;
begin
  if p_fpl_id is not null then
    select fpl_event_id into v_pick_gw from public.fpl_gameweeks
     where season_id = p_season and deadline_time < now() order by deadline_time desc limit 1;
    v_picks := private.email_fpl_picks_for(p_fpl_id, p_season, v_pick_gw);
  end if;
  if v_picks is not null or v_watch is not null then
    v_sections := private.email_sections(p_season, p_gw, v_picks, v_watch);
  end if;
  if p_club is not null then
    c := public.get_my_club_cards(array[p_club]::bigint[]) -> 0;
    if c is not null then
      -- The last result, with its competition and any shoot-out (a cup tie
      -- level after 90 minutes must not read as a plain draw).
      v_last := c->'recent'->0;
      if v_last is not null then
        select v_last || jsonb_build_object('competition', l.name, 'decided_by', m.decided_by,
                                            'pens', case when m.home_penalty_goals is not null and m.away_penalty_goals is not null
                                                         then jsonb_build_array(m.home_penalty_goals, m.away_penalty_goals) end)
          into v_last
          from public.fixtures f
          left join public.leagues l on l.league_id = f.league_id
          left join public.matches m on m.league_id = f.league_id and m.season_id = f.season_id
                                    and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
                                    and m.match_date = f.kickoff_date
         where f.fixture_id = (v_last->>'fixture_id')::bigint;
        v_last := coalesce(v_last, c->'recent'->0);
      end if;
      v_club := jsonb_build_object('name', c->'team'->>'display_name', 'slug', c->'team'->>'slug', 'next', c->'next', 'last', v_last);
    end if;
  end if;
  return jsonb_build_object('picks_gw', case when v_picks is not null then v_pick_gw end,
                            'squad_size', cardinality(v_picks), 'sections', v_sections, 'club', v_club);
end;
$function$
;

-- Live definition exported from the database (function email_manage(p_token text, p_changes jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_manage(p_token text, p_changes jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id bigint := private.email_token_owner(p_token, array['manage']); s private.email_subscribers; v_fpl bigint; v_club bigint;
begin
  if v_id is null then return jsonb_build_object('state', 'invalid'); end if;
  select * into s from private.email_subscribers where subscriber_id = v_id for update;
  if s.status <> 'confirmed' then return jsonb_build_object('state', s.status); end if;
  if p_changes is not null and jsonb_typeof(p_changes) = 'object' then
    if p_changes ? 'football' and jsonb_typeof(p_changes->'football') = 'boolean' then
      s.topics := case when (p_changes->>'football')::boolean then array['fpl', 'football_market'] else array['fpl'] end;
    end if;
    if p_changes ? 'fpl_id' then
      v_fpl := case when jsonb_typeof(p_changes->'fpl_id') = 'number' and (p_changes->>'fpl_id')::numeric between 1 and 99999999
                    then (p_changes->>'fpl_id')::numeric::bigint end;
      s.fpl_entry_id := v_fpl;
    end if;
    if p_changes ? 'watchlist' then
      s.watchlist := coalesce((select array_agg(x.id order by x.ord)
                                 from (select distinct on (e::int) e::int id, ord
                                         from jsonb_array_elements_text(case when jsonb_typeof(p_changes->'watchlist') = 'array'
                                                                             then p_changes->'watchlist' else '[]' end) with ordinality t(e, ord)
                                        where e ~ '^\d{1,6}$'
                                        order by e::int, ord) x
                                 join public.fpl_players p on p.season_id = public.fpl_current_season_id() and p.fpl_player_id = x.id
                                where x.ord <= 20), '{}');
    end if;
    if p_changes ? 'club_id' then
      v_club := case when jsonb_typeof(p_changes->'club_id') = 'number'
                     then (select team_id from public.teams where team_id = (p_changes->>'club_id')::numeric::bigint) end;
      s.club_team_id := v_club;
    end if;
    update private.email_subscribers
       set topics = s.topics, fpl_entry_id = s.fpl_entry_id, club_team_id = s.club_team_id, watchlist = s.watchlist, updated_at = now()
     where subscriber_id = v_id;
  end if;
  return jsonb_build_object('state', 'ok', 'football', 'football_market' = any (s.topics), 'fpl_id', s.fpl_entry_id,
                            'club', (select jsonb_build_object('id', t.team_id, 'name', coalesce(t.display_name, t.canonical_name))
                                       from public.teams t where t.team_id = s.club_team_id),
                            'watchlist', (select coalesce(jsonb_agg(jsonb_build_object('id', p.fpl_player_id, 'name', p.web_name, 'team', ft.short_name,
                                                                                        'pos', case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' end,
                                                                                        'price', round(p.now_cost / 10.0, 1))
                                                                     order by array_position(s.watchlist, p.fpl_player_id::int)), '[]')
                                            from public.fpl_players p
                                            left join public.fpl_teams ft on ft.season_id = p.season_id and ft.fpl_team_id = p.fpl_team_id
                                           where p.season_id = public.fpl_current_season_id() and p.fpl_player_id = any (s.watchlist)));
end;
$function$
;

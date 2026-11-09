-- Live definition exported from the database (function fanteam_save_paste(p_paste jsonb, p_rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fanteam_save_paste(p_paste jsonb, p_rows jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint;
begin
  perform public._require_admin();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'fanteam_save_paste: no rows';
  end if;
  insert into public.fanteam_price_pastes
    (contest_name, season_id, matchweek, rules_id, budget_m, stacking_penalty, safety_net,
     raw_text, row_count, parser_version, pasted_by, tournament_id)
  values
    (p_paste->>'contest_name', (p_paste->>'season_id')::int, (p_paste->>'matchweek')::int,
     (p_paste->>'rules_id')::bigint, (p_paste->>'budget_m')::numeric,
     (p_paste->>'stacking_penalty')::boolean, (p_paste->>'safety_net')::boolean,
     p_paste->>'raw_text', jsonb_array_length(p_rows), p_paste->>'parser_version', auth.uid(),
     nullif(p_paste->>'tournament_id', ''))
  returning paste_id into v_id;

  insert into public.fanteam_player_prices
    (paste_id, row_no, name_raw, club_raw, position, price_m, team_id, fpl_code, match_method,
     fanteam_player_id, first_name, surname, lineup_status)
  select v_id, (r->>'row_no')::int, r->>'name_raw', r->>'club_raw', r->>'position',
         (r->>'price_m')::numeric, nullif(r->>'team_id','')::int, nullif(r->>'fpl_code','')::int,
         r->>'match_method',
         nullif(r->>'fanteam_player_id','')::bigint, nullif(r->>'first_name',''), nullif(r->>'surname',''),
         nullif(r->>'lineup_status','')
  from jsonb_array_elements(p_rows) r;
  return v_id;
end $function$
;

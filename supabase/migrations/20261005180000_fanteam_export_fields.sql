-- FanTeam's player export (Tournament, PlayerID, Name, FName, Club, Lineup,
-- Position, Price) carries FanTeam's own player id, the name split into
-- first name and surname, and FanTeam's lineup status. Keep them with each
-- saved price row: the id is a stable key for future matching, and the
-- status (injured/suspended) decides who the optimiser leaves out.
alter table public.fanteam_player_prices
  add column if not exists fanteam_player_id bigint,
  add column if not exists first_name text,
  add column if not exists surname text,
  add column if not exists lineup_status text;

comment on column public.fanteam_player_prices.lineup_status is 'FanTeam''s lineup status from its export: expected, possible, unexpected, injured or suspended.';

create or replace function public.fanteam_save_paste(p_paste jsonb, p_rows jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  perform public._require_admin();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'fanteam_save_paste: no rows';
  end if;
  insert into public.fanteam_price_pastes
    (contest_name, season_id, matchweek, rules_id, budget_m, stacking_penalty, safety_net,
     raw_text, row_count, parser_version, pasted_by)
  values
    (p_paste->>'contest_name', (p_paste->>'season_id')::int, (p_paste->>'matchweek')::int,
     (p_paste->>'rules_id')::bigint, (p_paste->>'budget_m')::numeric,
     (p_paste->>'stacking_penalty')::boolean, (p_paste->>'safety_net')::boolean,
     p_paste->>'raw_text', jsonb_array_length(p_rows), p_paste->>'parser_version', auth.uid())
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
end $$;
revoke all on function public.fanteam_save_paste(jsonb, jsonb) from public, anon;
grant execute on function public.fanteam_save_paste(jsonb, jsonb) to authenticated;

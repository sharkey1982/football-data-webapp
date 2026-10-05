-- FanTeam: several saved contests, and Chris's own teams to compare with the
-- optimiser's (5 Oct 2026).
--
-- 1. fanteam_price_pastes.tournament_id: FanTeam's tournament id from the
--    export, so uploads of the same contest group together and a saved team
--    follows a re-upload. Backfilled from the raw text of earlier uploads.
-- 2. fanteam_my_teams: teams Chris actually entered (or is considering), keyed
--    by tournament; players by FanTeam player id (or name|club when the list
--    had no ids). Admin only, like the other FanTeam tables.

alter table public.fanteam_price_pastes add column if not exists tournament_id text;

update public.fanteam_price_pastes
   set tournament_id = nullif(split_part(split_part(raw_text, E'\n', 2), E'\t', 1), '')
 where tournament_id is null and raw_text like 'Tournament%';

create table public.fanteam_my_teams (
  my_team_id bigserial primary key,
  tournament_id text not null,
  label text not null,
  player_keys text[] not null,
  captain_key text,
  vice_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, label)
);
alter table public.fanteam_my_teams enable row level security;
revoke all on public.fanteam_my_teams from anon, authenticated;
grant select, insert, update, delete on public.fanteam_my_teams to authenticated;
grant usage on sequence public.fanteam_my_teams_my_team_id_seq to authenticated;
create policy fanteam_my_teams_admin on public.fanteam_my_teams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
comment on table public.fanteam_my_teams is 'Teams Chris entered in a FanTeam contest (or is considering), to compare with the optimiser. Players keyed ft:<FanTeam player id> or n:<name>|<club>. Private.';

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
end $$;
revoke all on function public.fanteam_save_paste(jsonb, jsonb) from public, anon;
grant execute on function public.fanteam_save_paste(jsonb, jsonb) to authenticated;

select public.meta_refresh_flow();
update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Teams Chris entered in FanTeam contests, compared on /admin/fanteam with the optimiser''s lineup.',
  refresh_note = 'Written from /admin/fanteam (My team tab).', purpose_reviewed_at = now()
where node_key = 'object:fanteam_my_teams';

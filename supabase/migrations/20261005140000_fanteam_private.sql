-- ============================================================================
-- FanTeam private optimiser (admin only), 4 Oct 2026.
-- Design: Claude Docs "FanTeam private optimiser — design".
--
-- Prices come only from Chris pasting FanTeam's price list into
-- /admin/fanteam (no scraping, no FanTeam API calls). Everything here is
-- private: anon has no access; signed-in non-admins see nothing (RLS).
--
--   fantasy_game_rules     contest-format templates (provider-generic)
--   fantasy_scoring_rules  scoring as data (provider-generic; FanTeam only for now)
--   fanteam_price_pastes   one row per paste (raw text kept), append-only
--   fanteam_player_prices  one row per player per paste, append-only
--   fanteam_player_map     manual FanTeam -> FPL player fixes
--   fanteam_club_map       manual FanTeam club -> team fixes
--   fanteam_save_paste()   writes a paste and its rows in one transaction
--   fanteam_projection_inputs(matchweek)  per player x fixture inputs from the
--                          existing FPL projection stack (public data anyway)
-- ============================================================================

create table public.fantasy_game_rules (
  rules_id bigserial primary key,
  provider text not null,
  format text not null,                    -- e.g. classic_11, classic_seasonal
  season_label text not null,              -- '2627'
  budget_m numeric(6,1) not null,          -- default; weekly contests override per paste
  squad_size int not null,
  starting_size int not null,
  squad_quota jsonb,                       -- exact squad counts by position (seasonal), null when squad = XI
  xi_min jsonb not null,                   -- {"GK":1,"DEF":3,"MID":3,"FWD":1}
  xi_max jsonb not null,
  max_per_club int not null,
  captain_multiplier numeric(4,2) not null,
  vice_rule text not null,                 -- 'if_captain_does_not_start' | 'if_captain_does_not_play'
  stacking_penalty jsonb,                  -- {"positions":["GK","DEF"],"steps":[0,1,2,3,3,3]} or null
  safety_net text not null default 'off',  -- 'off' | 'same_club_position_cheaper_closest'
  transfer_rules jsonb,
  scoring_version text not null,
  source_url text not null,
  verified_at date not null,
  notes text,
  unique (provider, format, season_label)
);

create table public.fantasy_scoring_rules (
  rule_id bigserial primary key,
  provider text not null,
  scoring_version text not null,
  rule_code text not null,
  position text check (position in ('GK','DEF','MID','FWD')),  -- null = all positions
  points numeric(5,2) not null,
  per_n int,                               -- e.g. 2 for "every 2 goals conceded"
  threshold_minutes int,                   -- e.g. 60 for clean sheet
  source_url text not null,
  verified_at date not null,
  notes text
);
create unique index fantasy_scoring_rules_key
  on public.fantasy_scoring_rules (provider, scoring_version, rule_code, coalesce(position, ''));

create table public.fanteam_price_pastes (
  paste_id bigserial primary key,
  pasted_at timestamptz not null default now(),
  pasted_by uuid default auth.uid(),
  contest_name text,
  season_id int not null,
  matchweek int not null,
  rules_id bigint not null references public.fantasy_game_rules(rules_id),
  budget_m numeric(6,1) not null,
  stacking_penalty boolean not null,
  safety_net boolean not null,
  raw_text text not null,
  row_count int not null,
  parser_version text not null
);

create table public.fanteam_player_prices (
  paste_id bigint not null references public.fanteam_price_pastes(paste_id),
  row_no int not null,
  name_raw text not null,
  club_raw text not null,
  position text not null check (position in ('GK','DEF','MID','FWD')),
  price_m numeric(5,1) not null check (price_m > 0),
  team_id int,                             -- FixtureShark teams.team_id, null = unmatched club
  fpl_code int,                            -- auto match at paste time, null = unmatched
  match_method text,                       -- exact | surname | initial | manual | none
  primary key (paste_id, row_no)
);

create table public.fanteam_player_map (
  name_key text not null,                  -- normalised FanTeam name
  team_id int not null,
  fpl_code int,                            -- null = deliberately unmatched (e.g. not in FPL)
  set_at timestamptz not null default now(),
  primary key (name_key, team_id)
);

create table public.fanteam_club_map (
  club_key text primary key,               -- normalised FanTeam club name
  team_id int not null,
  set_at timestamptz not null default now()
);

-- Access: admins only, through RLS; nothing for anon.
do $$
declare t text;
begin
  foreach t in array array['fantasy_game_rules','fantasy_scoring_rules','fanteam_price_pastes',
                           'fanteam_player_prices','fanteam_player_map','fanteam_club_map'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_admin_read', t);
  end loop;
end $$;

grant select on public.fantasy_game_rules, public.fantasy_scoring_rules,
  public.fanteam_price_pastes, public.fanteam_player_prices,
  public.fanteam_player_map, public.fanteam_club_map to authenticated;
-- Manual fixes are edited from the page.
grant insert, update, delete on public.fanteam_player_map, public.fanteam_club_map to authenticated;
create policy fanteam_player_map_admin_write on public.fanteam_player_map for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy fanteam_club_map_admin_write on public.fanteam_club_map for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- One transaction for a paste and its rows; admin only. Prices are append-only:
-- no update/delete grants on the paste tables at all.
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
    (paste_id, row_no, name_raw, club_raw, position, price_m, team_id, fpl_code, match_method)
  select v_id, (r->>'row_no')::int, r->>'name_raw', r->>'club_raw', r->>'position',
         (r->>'price_m')::numeric, nullif(r->>'team_id','')::int, nullif(r->>'fpl_code','')::int,
         r->>'match_method'
  from jsonb_array_elements(p_rows) r;
  return v_id;
end $$;
revoke all on function public.fanteam_save_paste(jsonb, jsonb) from public, anon;
grant execute on function public.fanteam_save_paste(jsonb, jsonb) to authenticated;

-- Per player x fixture inputs for a current-season Premier League matchweek.
-- Everything it reads is already public; kept off anon anyway.
create or replace function public.fanteam_projection_inputs(p_matchweek int)
returns table (
  fixture_id bigint, matchweek int, kickoff_date date, kickoff_time text,
  fpl_player_id int, fpl_code int, web_name text, first_name text, second_name text,
  element_type int, team_id int, team_name text, opponent_name text, is_home boolean,
  now_cost int, status text,
  start_probability numeric, sub_appearance_probability numeric, expected_minutes numeric,
  expected_goals numeric, expected_assists numeric, expected_saves numeric,
  xpts_clean_sheet numeric, xpts_goals_conceded numeric, xpts_penalties numeric, xpts_cards_own_goals numeric,
  team_goals numeric, opp_goals numeric,
  p_off_before_60 numeric, p_off_60_84 numeric, p_full numeric,
  generated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select pr.fixture_id::bigint, f.matchweek::int, f.kickoff_date::date, f.kickoff_time::text,
         pr.fpl_player_id::int, p.fpl_code::int, p.web_name::text, p.first_name::text, p.second_name::text,
         p.element_type::int, p.canonical_team_id::int, t.canonical_name::text, o.canonical_name::text,
         p.canonical_team_id = f.home_team_id,
         p.now_cost::int, p.status::text,
         least(1, greatest(0, pr.start_probability))::numeric,
         least(greatest(0, 1 - least(1, greatest(0, pr.start_probability))), greatest(0, pr.sub_appearance_probability))::numeric,
         pr.expected_minutes::numeric,
         pr.expected_goals::numeric, pr.expected_assists::numeric, pr.expected_saves::numeric,
         pr.xpts_clean_sheet::numeric, pr.xpts_goals_conceded::numeric, pr.xpts_penalties::numeric, pr.xpts_cards_own_goals::numeric,
         (case when p.canonical_team_id = f.home_team_id
               then coalesce(f.market_home_goals, f.predicted_home_goals)
               else coalesce(f.market_away_goals, f.predicted_away_goals) end)::numeric,
         (case when p.canonical_team_id = f.home_team_id
               then coalesce(f.market_away_goals, f.predicted_away_goals)
               else coalesce(f.market_home_goals, f.predicted_home_goals) end)::numeric,
         eb.p_off_before_60::numeric, eb.p_off_60_84::numeric, eb.p_full::numeric,
         pr.generated_at
  from public.fpl_player_projections pr
  join public.fixtures f on f.fixture_id = pr.fixture_id
  join public.fpl_players p on p.season_id = pr.season_id and p.fpl_player_id = pr.fpl_player_id
  left join public.teams t on t.team_id = p.canonical_team_id
  left join public.teams o on o.team_id = case when p.canonical_team_id = f.home_team_id then f.away_team_id else f.home_team_id end
  left join public.fpl_player_exit_bands eb on eb.season_id = pr.season_id and eb.fpl_player_id = pr.fpl_player_id
  where pr.model_version = 'leaguewide_v6'
    and f.league_id = 1
    and f.season_id = public.fpl_current_season_id()
    and f.matchweek = p_matchweek
$$;
revoke all on function public.fanteam_projection_inputs(int) from public, anon;
grant execute on function public.fanteam_projection_inputs(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed: FanTeam football scoring, read from
-- https://www.fanteam.com/support-questions/scoring-rules on 4 Oct 2026.
-- ---------------------------------------------------------------------------
insert into public.fantasy_scoring_rules (provider, scoring_version, rule_code, position, points, per_n, threshold_minutes, source_url, verified_at, notes)
select 'fanteam', 'fanteam_football_2026', r.code, r.pos, r.pts, r.per_n, r.thr,
       'https://www.fanteam.com/support-questions/scoring-rules', date '2026-10-04', r.notes
from (values
  ('appearance',               null::text, 1.0,  null::int, null::int, 'Every player who plays'),
  ('minutes_60',               null,       1.0,  null, 60,   'At least 60 full minutes (59:30 does not count)'),
  ('full_match',               'MID',      1.0,  null, null, 'Played the full match (90 + stoppage) without being subbed off'),
  ('full_match',               'FWD',      1.0,  null, null, 'As MID'),
  ('goal',                     'GK',       8.0,  null, null, null),
  ('goal',                     'DEF',      6.0,  null, null, null),
  ('goal',                     'MID',      5.0,  null, null, null),
  ('goal',                     'FWD',      4.0,  null, null, null),
  ('assist',                   null,       3.0,  null, null, 'Assist / fantasy assist'),
  ('clean_sheet',              'GK',       4.0,  null, 60,   'No goals conceded while on the pitch, 60+ minutes'),
  ('clean_sheet',              'DEF',      4.0,  null, 60,   null),
  ('clean_sheet',              'MID',      1.0,  null, 60,   null),
  ('goals_conceded',           'GK',      -1.0,  2,    null, 'Every 2 goals conceded'),
  ('goals_conceded',           'DEF',     -1.0,  2,    null, 'Every 2 goals conceded'),
  ('shot_on_target',           'GK',       1.0,  null, null, 'A shot that scores is not also a shot on target'),
  ('shot_on_target',           'DEF',      0.6,  null, null, null),
  ('shot_on_target',           'MID',      0.4,  null, null, null),
  ('shot_on_target',           'FWD',      0.4,  null, null, null),
  ('save',                     'GK',       0.5,  null, null, null),
  ('penalty_save',             'GK',       5.0,  null, null, null),
  ('impact_positive',          null,       0.3,  null, null, 'Team won while the player was on the pitch'),
  ('impact_negative',          null,      -0.3,  null, null, 'Team lost while the player was on the pitch'),
  ('caused_penalty',           null,      -2.0,  null, null, null),
  ('caused_scoring_free_kick', null,      -2.0,  null, null, 'Foul leading to a direct free-kick goal'),
  ('penalty_miss',             null,      -2.0,  null, null, null),
  ('own_goal',                 null,      -2.0,  null, null, null),
  ('yellow_card',              null,      -1.0,  null, null, null),
  ('red_card',                 null,      -3.0,  null, null, null)
) as r(code, pos, pts, per_n, thr, notes);

insert into public.fantasy_game_rules
  (provider, format, season_label, budget_m, squad_size, starting_size, squad_quota, xi_min, xi_max,
   max_per_club, captain_multiplier, vice_rule, stacking_penalty, safety_net, transfer_rules,
   scoring_version, source_url, verified_at, notes)
values
  ('fanteam', 'classic_11', '2627', 108.0, 11, 11, null,
   '{"GK":1,"DEF":3,"MID":3,"FWD":1}', '{"GK":1,"DEF":5,"MID":5,"FWD":3}',
   3, 2.0, 'if_captain_does_not_start',
   '{"positions":["GK","DEF"],"steps":[0,1,2,3,3,3]}', 'same_club_position_cheaper_closest', null,
   'fanteam_football_2026', 'https://www.fanteam.com/support-questions/scoring-rules', date '2026-10-04',
   'Weekly Classic 11. Budget, stacking and safety net vary by contest and are set per paste; defaults from EPL Weekly Special Week 6 (screenshot, 4 Oct 2026).'),
  ('fanteam', 'classic_seasonal', '2627', 100.0, 15, 11,
   '{"GK":2,"DEF":5,"MID":5,"FWD":3}', '{"GK":1,"DEF":3,"MID":2,"FWD":1}', '{"GK":1,"DEF":5,"MID":5,"FWD":3}',
   3, 2.0, 'if_captain_does_not_play', null, 'off',
   '{"free_per_gw":1,"bank":"unlimited until wildcard","hit":-4,"wildcards":2}',
   'fanteam_football_2026', 'https://www.fanteam.com/support-questions/scoring-rules', date '2026-10-04',
   'Squad shape and captaincy first-party; budget, club cap and transfers from FISO (Aug 2026); XI formation limits unconfirmed. Not used by version 1.');

comment on table public.fantasy_game_rules is 'Fantasy contest-format templates (provider, format, season): budget, squad shape, club cap, captaincy, stacking penalty, safety net. Read by /admin/fanteam. Private.';
comment on table public.fantasy_scoring_rules is 'Fantasy scoring as data, by provider and scoring version (FanTeam only for now; FPL stays in fpl_scoring_rules). Private.';
comment on table public.fanteam_price_pastes is 'Each FanTeam price list Chris pasted into /admin/fanteam, with the contest settings and the raw text. Append-only. Private.';
comment on table public.fanteam_player_prices is 'One row per player per FanTeam price paste, with the automatic FPL match made at paste time. Append-only; builds FanTeam price history. Private.';
comment on table public.fanteam_player_map is 'Manual FanTeam player -> FPL player fixes (by normalised name and team), applied over automatic matches. Private.';
comment on table public.fanteam_club_map is 'Manual FanTeam club name -> FixtureShark team fixes. Private.';

select public.meta_refresh_flow();
update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = case node_key
    when 'object:fantasy_game_rules' then 'Fantasy contest-format templates (FanTeam Classic 11 and Classic Seasonal): budget, squad shape, club cap, captaincy, stacking penalty, safety net.'
    when 'object:fantasy_scoring_rules' then 'Fantasy scoring rules as data by provider and version; FanTeam football scoring read from its scoring-rules page on 4 Oct 2026.'
    when 'object:fanteam_price_pastes' then 'FanTeam price lists pasted by Chris on /admin/fanteam, with contest settings and raw text. Append-only.'
    when 'object:fanteam_player_prices' then 'Per-player FanTeam prices from each paste, with the FPL match. Append-only price history.'
    when 'object:fanteam_player_map' then 'Manual FanTeam player to FPL player fixes.'
    when 'object:fanteam_club_map' then 'Manual FanTeam club to FixtureShark team fixes.'
  end,
  refresh_note = case when node_key in ('object:fantasy_game_rules','object:fantasy_scoring_rules')
    then 'Seeded by migration; change by migration when FanTeam changes its rules.'
    else 'Written from /admin/fanteam when Chris pastes prices or fixes a match.' end,
  purpose_reviewed_at = now()
where node_key in ('object:fantasy_game_rules','object:fantasy_scoring_rules','object:fanteam_price_pastes',
                   'object:fanteam_player_prices','object:fanteam_player_map','object:fanteam_club_map');

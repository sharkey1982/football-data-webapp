-- Actual line-ups with positions, from Chris's BBC screenshots (10 Oct 2026).
--
-- No free automated source gives positions this season (API-Football's free
-- plan stops at 2024; BBC, ESPN and the Premier League forbid collecting
-- their data). Chris: "accept my screenshots". Read by hand from six images.
-- BBC draws the goalkeeper at the TOP, so the left of the image is the
-- team's RIGHT (White and Saka on the left = RB and RW).
--
-- 1. fixture_lineup_positions: who started where, per fixture. Kept apart
--    from fixture_actual_lineup_players (FPL's starters/minutes) so the
--    actual-v-predicted view doesn't see each player twice.
-- 2. team_match_tactics: the formation each side lined up in.
-- 3. Corrections to seeded tactical roles (never rows an admin set):
--    - generic DEF/MID rows for players seen starting in a set position
--      get that position (Elvedi CB, Gudmundsson LWB, Tomiyasu CB,
--      Kerkez LB, Gakpo RW);
--    - Leeds' centre-backs: Justin played on the right, Muharemovic on
--      the left;
--    - seeded first choices who are fit but have not been starting move
--      behind the player who has (Bijol, Bard, Wilson at Leeds; Tsimikas
--      at Liverpool). Their season start record says the same.
-- 4. Madueke also plays LW (2nd), as Arsenal lined up today.
--
-- Safe to re-run: inserts skip existing rows, updates only touch rows still
-- holding the old value.

create table if not exists public.fixture_lineup_positions (
  fixture_id bigint not null references public.fixtures(fixture_id) on delete cascade,
  team_id bigint not null references public.teams(team_id),
  fpl_player_id bigint not null,
  tactical_role text not null,
  name_source text,
  source_name text not null,
  captured_at timestamptz not null default now(),
  primary key (fixture_id, team_id, fpl_player_id, source_name)
);
alter table public.fixture_lineup_positions enable row level security;
drop policy if exists fixture_lineup_positions_read on public.fixture_lineup_positions;
create policy fixture_lineup_positions_read on public.fixture_lineup_positions for select using (true);
drop policy if exists fixture_lineup_positions_admin_write on public.fixture_lineup_positions;
create policy fixture_lineup_positions_admin_write on public.fixture_lineup_positions for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.fixture_lineup_positions to anon, authenticated;
grant insert, update, delete on public.fixture_lineup_positions to authenticated;
grant all on public.fixture_lineup_positions to service_role;
comment on table public.fixture_lineup_positions is 'Starting XI with each player''s position, per fixture and source (bbc_screenshot = read by hand from screenshots an admin supplied). Roles use the tactical-role codes; in a 3-4-2-1 the two behind the striker are RW/LW.';

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- GW6 Arsenal v Leeds (fixture 51)
    (51, 1, 1, 'GK', 'Raya'), (51, 1, 10, 'RB', 'White'), (51, 1, 31, 'RCB', 'Konsa'), (51, 1, 4, 'LCB', 'Gabriel Magalhaes'),
    (51, 1, 8, 'LB', 'Calafiori'), (51, 1, 13, 'DM', 'Rice'), (51, 1, 7, 'DM', 'Lewis-Skelly'), (51, 1, 12, 'RW', 'Saka'),
    (51, 1, 15, 'AM', 'Odegaard'), (51, 1, 16, 'LW', 'Madueke'), (51, 1, 26, 'CF', 'Havertz'),
    (51, 36, 385, 'GK', 'Trafford'), (51, 36, 332, 'RCB', 'Justin'), (51, 36, 598, 'CB', 'Elvedi'), (51, 36, 334, 'LCB', 'Muharemovic'),
    (51, 36, 330, 'RWB', 'Bogle'), (51, 36, 338, 'CM', 'Ampadu'), (51, 36, 345, 'CM', 'Tanaka'), (51, 36, 331, 'LWB', 'Gudmundsson'),
    (51, 36, 335, 'RW', 'Stach'), (51, 36, 336, 'LW', 'Okafor'), (51, 36, 346, 'CF', 'Calvert-Lewin'),
    -- GW5 Leeds v Crystal Palace (fixture 46)
    (46, 36, 385, 'GK', 'Trafford'), (46, 36, 332, 'RCB', 'Justin'), (46, 36, 598, 'CB', 'Elvedi'), (46, 36, 334, 'LCB', 'Muharemovic'),
    (46, 36, 330, 'RWB', 'Bogle'), (46, 36, 338, 'CM', 'Ampadu'), (46, 36, 345, 'CM', 'Tanaka'), (46, 36, 331, 'LWB', 'Gudmundsson'),
    (46, 36, 335, 'RW', 'Stach'), (46, 36, 336, 'LW', 'Okafor'), (46, 36, 346, 'CF', 'Calvert-Lewin'),
    (46, 2, 199, 'GK', 'Benitez'), (46, 2, 202, 'RCB', 'Richards'), (46, 2, 577, 'CB', 'Tomiyasu'), (46, 2, 203, 'LCB', 'Canvot'),
    (46, 2, 588, 'RWB', 'Khalaili'), (46, 2, 644, 'CM', 'Timber'), (46, 2, 210, 'CM', 'Wharton'), (46, 2, 204, 'LWB', 'Mitchell'),
    (46, 2, 214, 'RW', 'Kamada'), (46, 2, 211, 'LW', 'Pino'), (46, 2, 222, 'CF', 'Strand Larsen'),
    -- GW5 Bournemouth v Liverpool (fixture 41)
    (41, 30, 57, 'GK', 'Petrovic'), (41, 30, 64, 'RB', 'Smith'), (41, 30, 60, 'RCB', 'Hill'), (41, 30, 566, 'LCB', 'Antonio Silva'),
    (41, 30, 61, 'LB', 'Truffert'), (41, 30, 73, 'DM', 'Adams'), (41, 30, 69, 'DM', 'Scott'), (41, 30, 67, 'RW', 'Rayan'),
    (41, 30, 75, 'AM', 'Christie'), (41, 30, 68, 'LW', 'Tavernier'), (41, 30, 79, 'CF', 'Evanilson'),
    (41, 15, 350, 'GK', 'Alisson Becker'), (41, 15, 579, 'RB', 'Araujo'), (41, 15, 362, 'RCB', 'Jacquet'), (41, 15, 356, 'LCB', 'van Dijk'),
    (41, 15, 358, 'LB', 'Kerkez'), (41, 15, 368, 'DM', 'Szoboszlai'), (41, 15, 372, 'DM', 'Mac Allister'), (41, 15, 367, 'RW', 'Gakpo'),
    (41, 15, 366, 'AM', 'Wirtz'), (41, 15, 627, 'LW', 'Barcola'), (41, 15, 379, 'CF', 'Isak')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (51, 1, '4-2-3-1'), (51, 36, '3-4-2-1'), (46, 36, '3-4-2-1'), (46, 2, '3-4-2-1'),
               (41, 30, '4-2-3-1'), (41, 15, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

-- Role corrections. Each touches the row only while it still holds the
-- seeded value and was not set by an admin.
update public.team_player_tactical_defaults d
   set tactical_role = c.new_role, depth_rank = c.new_rank,
       source_name = 'bbc_screenshot', depth_rank_source = 'bbc_screenshot', updated_at = now()
  from (values
    (36, 332, 'LCB', 1, 'RCB', 1),   -- Justin
    (36, 334, 'CB',  1, 'LCB', 1),   -- Muharemovic
    (36, 598, 'DEF', 3, 'CB',  2),   -- Elvedi
    (36, 331, 'DEF', 3, 'LWB', 2),   -- Gudmundsson
    (36, 327, 'RCB', 1, 'RCB', 2),   -- Bijol: fit, rarely starting
    (36, 641, 'LWB', 1, 'LWB', 3),   -- Bard: fit, no starts
    (36, 260, 'RW',  1, 'RW',  2),   -- Wilson: one start in the weighted record
    (2,  577, 'DEF', 3, 'CB',  2),   -- Tomiyasu
    (15, 358, 'DEF', 3, 'LB',  1),   -- Kerkez: starting
    (15, 364, 'LB',  1, 'LB',  2),   -- Tsimikas: fit, rarely starting
    (15, 367, 'MID', 3, 'RW',  2)    -- Gakpo
  ) as c(team_id, fpl_player_id, old_role, old_rank, new_role, new_rank)
 where d.season_id = public.fpl_current_season_id()
   and d.team_id = c.team_id and d.fpl_player_id = c.fpl_player_id
   and d.tactical_role = c.old_role and d.depth_rank = c.old_rank
   and d.source_name is distinct from 'manual';

insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
values (public.fpl_current_season_id(), 1, 16, 'LW', 2)   -- Madueke
on conflict do nothing;

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
select '2026-10-10', 'data',
  'FPL: actual line-ups with positions from BBC screenshots; seeded roles corrected',
  'Chris supplied BBC line-up screenshots (Arsenal and Leeds GW6; Leeds, Crystal Palace, Bournemouth, Liverpool GW5). No permitted automated source gives positions.',
  'New table fixture_lineup_positions (66 rows) and formations in team_match_tactics. Corrected 11 seeded tactical roles (Leeds back three and wing-backs, Tomiyasu, Kerkez, Gakpo; fit-but-unpicked seeded first choices moved to second) and added Madueke LW (2nd). Checked offline: Leeds GW6 now projects the XI that started; Madueke 68% v Eze 34% on the left.',
  'leaguewide_v6', 'leaguewide_v6',
  'migration 20261010190000'
where not exists (select 1 from public.model_change_log where reference = 'migration 20261010190000');

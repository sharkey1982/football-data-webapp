-- ============================================================================
-- Shark Fantasy phase 3b: the database (10 Oct 2026). Design: project doc
-- claude/shark-fantasy-design-2026-10-10.md §1–3 (rules approved by Chris).
--
-- Layout as for nfl/tennis: raw tables in the unexposed sf schema; the site
-- reads public.sf_* views (security_invoker); every write goes through a
-- function. The simulation runs in TypeScript (src/sharkfantasy, run by
-- scripts/sf/run-round.ts with the service role); the database:
--   * keeps the hidden inputs (worlds, player_hidden, engine_snapshots) away
--     from anon and authenticated altogether;
--   * owns the state machine: a round is open → locked (at the deadline:
--     every squad frozen into a snapshot, hits charged) → final (results,
--     events, stats and scores written in one transaction);
--   * refuses to write a result twice (fixture key unique, state checks) and
--     refuses any change to a final result, event, stat or score (triggers);
--   * checks every squad change against the rules (sf.game_rules, the mirror
--     of src/sharkfantasy/fantasy/rules.ts) with the database clock.
-- Prototype flag: only universes marked is_public are visible, except to
-- admins. Nothing is public at launch.
-- ============================================================================

create schema if not exists sf;
grant usage on schema sf to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Rules (versioned; the TypeScript mirror is pinned by tests).
-- ---------------------------------------------------------------------------
create table sf.game_rules (
  version text primary key,
  rules jsonb not null,
  created_at timestamptz not null default now()
);
insert into sf.game_rules (version, rules) values ('sf-game-1', '{
  "budget": 1000,
  "squad": {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3},
  "xiMin": {"GK": 1, "DEF": 3, "MID": 2, "FWD": 1},
  "xiMax": {"GK": 1, "DEF": 5, "MID": 5, "FWD": 3},
  "maxPerClub": 3, "captainMultiplier": 2, "freeTransfersPerRound": 1, "maxBankedTransfers": 3,
  "hit": 4, "wildcards": 1,
  "priceBand": {"GK": [40, 60], "DEF": [40, 70], "MID": [45, 105], "FWD": [45, 120]},
  "priceStepMax": 2, "priceSeasonMax": 6, "transferDrivenFrom": 200
}') on conflict do nothing;

-- ---------------------------------------------------------------------------
-- World.
-- ---------------------------------------------------------------------------
create table sf.universes (
  id text primary key,
  name text not null,
  seed text not null,
  engine_version text not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

-- The generated world as the engine sees it (hidden attributes included). Never granted.
create table sf.worlds (
  universe_id text primary key references sf.universes(id),
  world jsonb not null
);

create table sf.managers (
  universe_id text not null references sf.universes(id),
  id text not null,
  name text not null,
  rotation numeric not null,
  attack_lean numeric not null,
  formations text[] not null,
  primary key (universe_id, id)
);

create table sf.identity_provenance (
  id bigint generated always as identity primary key,
  category text not null check (category in ('original', 'comic', 'historical')),
  source text,
  rights_status text not null default 'pending' check (rights_status in ('pending', 'approved', 'rejected')),
  reviewer text,
  notes text
);

create table sf.clubs (
  universe_id text not null references sf.universes(id),
  id text not null,
  name text not null,
  short text not null,
  manager_id text not null,
  home_boost numeric not null,
  identity_category text not null default 'original' check (identity_category in ('original', 'comic', 'historical')),
  provenance_id bigint references sf.identity_provenance(id),
  primary key (universe_id, id),
  foreign key (universe_id, manager_id) references sf.managers(universe_id, id)
);

create table sf.players (
  universe_id text not null references sf.universes(id),
  id text not null,
  club_id text not null,
  name text not null,
  nationality text not null,
  age int not null,
  position text not null check (position in ('GK', 'DEF', 'MID', 'FWD')),
  identity_category text not null default 'original' check (identity_category in ('original', 'comic', 'historical')),
  provenance_id bigint references sf.identity_provenance(id),
  primary key (universe_id, id),
  foreign key (universe_id, club_id) references sf.clubs(universe_id, id),
  -- a non-original identity needs an approved provenance before it can be public (checked in the views)
  check (identity_category = 'original' or provenance_id is not null)
);

-- Hidden attributes per season. Never granted.
create table sf.player_hidden (
  universe_id text not null,
  player_id text not null,
  season int not null,
  attrs jsonb not null,
  primary key (universe_id, player_id, season),
  foreign key (universe_id, player_id) references sf.players(universe_id, id)
);

create table sf.seasons (
  id bigint generated always as identity primary key,
  universe_id text not null references sf.universes(id),
  number int not null,
  state text not null default 'live' check (state in ('preseason', 'live', 'finals', 'transition', 'done')),
  rules_version text not null references sf.game_rules(version),
  scoring_version text not null,
  shield_winner text,
  created_at timestamptz not null default now(),
  unique (universe_id, number)
);

create table sf.rounds (
  season_id bigint not null references sf.seasons(id),
  number int not null check (number between 1 and 10),
  kind text not null check (kind in ('league', 'finals')),
  deadline_at timestamptz not null,
  kickoff_at timestamptz not null,
  state text not null default 'upcoming' check (state in ('upcoming', 'open', 'locked', 'final')),
  locked_at timestamptz,
  finalised_at timestamptz,
  primary key (season_id, number),
  check (kickoff_at >= deadline_at)
);

create table sf.fixtures (
  id bigint generated always as identity primary key,
  season_id bigint not null,
  round int not null,
  fixture_key text not null unique,            -- s{season}|r{round}|{home}-{away}: the engine's key
  home_id text not null,
  away_id text not null,
  kind text not null check (kind in ('league', 'final', 'placing')),
  state text not null default 'scheduled' check (state in ('scheduled', 'final')),
  foreign key (season_id, round) references sf.rounds(season_id, number),
  unique (season_id, round, home_id),
  unique (season_id, round, away_id)
);

-- Engine state after each round (club injuries, bans, form, all results). Never granted.
create table sf.engine_snapshots (
  season_id bigint not null references sf.seasons(id),
  after_round int not null check (after_round between 0 and 10),
  engine_version text not null,
  state jsonb not null,
  state_hash text not null,
  created_at timestamptz not null default now(),
  primary key (season_id, after_round)
);

-- ---------------------------------------------------------------------------
-- Match outcomes (immutable once written).
-- ---------------------------------------------------------------------------
create table sf.match_results (
  fixture_id bigint primary key references sf.fixtures(id),
  home_goals int not null,
  away_goals int not null,
  xg_home numeric not null,
  xg_away numeric not null,
  shootout jsonb,
  seed text not null,
  engine_version text not null,
  finalised_at timestamptz not null default now()
);

create table sf.match_events (
  fixture_id bigint not null references sf.fixtures(id),
  seq int not null,
  minute int not null,
  type text not null,
  side text not null check (side in ('home', 'away')),
  player_id text,
  detail jsonb,
  primary key (fixture_id, seq)
);

create table sf.player_match_stats (
  fixture_id bigint not null references sf.fixtures(id),
  player_id text not null,
  side text not null check (side in ('home', 'away')),
  position text not null,
  started boolean not null,
  minutes int not null,
  goals int not null, assists int not null, own_goals int not null,
  pen_misses int not null, pen_saves int not null, saves int not null, conceded int not null,
  yellow int not null, red int not null,
  clean_sheet boolean not null, injured boolean not null,
  bonus int not null default 0,
  points int not null,
  primary key (fixture_id, player_id)
);
create index sf_pms_player_idx on sf.player_match_stats (player_id);

-- What managers may see about each player (design §8). Scouting is published once a season.
create table sf.scouting (
  season_id bigint not null references sf.seasons(id),
  player_id text not null,
  attack int not null, creativity int not null, defence int not null, keeping int not null, discipline int not null,
  primary key (season_id, player_id)
);

create table sf.player_status (
  season_id bigint not null references sf.seasons(id),
  player_id text not null,
  available_from int not null default 0,      -- first round he can play (injury or ban)
  updated_after_round int not null default 0,
  primary key (season_id, player_id)
);

-- Auditable price history: a row whenever a price is set or changes.
create table sf.player_prices (
  season_id bigint not null references sf.seasons(id),
  player_id text not null,
  from_round int not null check (from_round between 1 and 10),
  price int not null check (price between 30 and 150),
  reason text not null check (reason in ('initial', 'form', 'transfers', 'correction')),
  inputs jsonb,
  created_at timestamptz not null default now(),
  primary key (season_id, player_id, from_round)
);

create table sf.season_players (
  season_id bigint not null references sf.seasons(id),
  player_id text not null,
  start_price int not null,
  expected_per_round numeric not null,       -- the pre-season projection the price assumed
  primary key (season_id, player_id)
);

create table sf.projections (
  season_id bigint not null references sf.seasons(id),
  round int not null,
  player_id text not null,
  made_after_round int not null,
  x_points numeric not null,
  p_start numeric not null,
  x_minutes numeric not null,
  x_goals numeric not null,
  x_assists numeric not null,
  p_clean_sheet numeric not null,
  primary key (season_id, round, player_id)
);

-- ---------------------------------------------------------------------------
-- Fantasy. People and bots alike.
-- ---------------------------------------------------------------------------
create table sf.fantasy_managers (
  id bigint generated always as identity primary key,
  user_id uuid unique references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  is_bot boolean not null default false,
  bot_kind text check (bot_kind in ('optimiser', 'template', 'setforget', 'chaser', 'random')),
  bot_key text unique,                         -- bots: universe|kind-n (fixes their seeded opinions)
  created_at timestamptz not null default now(),
  check (is_bot = (user_id is null)),
  check (is_bot = (bot_kind is not null))
);

create table sf.entries (
  id bigint generated always as identity primary key,
  manager_id bigint not null references sf.fantasy_managers(id) on delete cascade,
  season_id bigint not null references sf.seasons(id),
  team_name text not null check (char_length(team_name) between 1 and 40),
  joined_round int not null,
  bank int not null default 0,
  free_transfers int not null default 1,
  wildcards_left int not null default 1,
  transfers_this_round int not null default 0,
  wildcard_this_round boolean not null default false,
  created_at timestamptz not null default now(),
  unique (manager_id, season_id)
);

-- The current squad. slot 1–11 the XI, 12 the reserve keeper, 13–15 the bench in order.
create table sf.entry_picks (
  entry_id bigint not null references sf.entries(id) on delete cascade,
  player_id text not null,
  slot int not null check (slot between 1 and 15),
  is_captain boolean not null default false,
  is_vice boolean not null default false,
  purchase_price int not null,
  primary key (entry_id, player_id),
  unique (entry_id, slot)
);

-- Frozen at the deadline; this is what scores.
create table sf.entry_round_snapshots (
  entry_id bigint not null references sf.entries(id) on delete cascade,
  round int not null,
  picks jsonb not null,                        -- [{player_id, slot, is_captain, is_vice, purchase_price}]
  bank int not null,
  transfers int not null,
  hits int not null,
  wildcard boolean not null,
  created_at timestamptz not null default now(),
  primary key (entry_id, round)
);

create table sf.transfers (
  id bigint generated always as identity primary key,
  entry_id bigint not null references sf.entries(id) on delete cascade,
  round int not null,
  player_out text not null,
  player_in text not null,
  price_out int not null,                      -- the selling price
  price_in int not null,
  wildcard boolean not null default false,
  made_at timestamptz not null default now()
);
create index sf_transfers_entry_idx on sf.transfers (entry_id, round);

create table sf.entry_round_scores (
  entry_id bigint not null references sf.entries(id) on delete cascade,
  round int not null,
  points int not null,
  hits int not null,
  total int not null,
  captain_used text,
  subs jsonb not null default '[]',
  rules_version text not null,
  scoring_version text not null,
  created_at timestamptz not null default now(),
  primary key (entry_id, round),
  check (total = points - hits)
);

create table sf.leagues (
  id bigint generated always as identity primary key,
  season_id bigint not null references sf.seasons(id),
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('public', 'private')),
  join_code text unique,
  owner_entry_id bigint references sf.entries(id) on delete set null,
  created_at timestamptz not null default now()
);
create table sf.league_members (
  league_id bigint not null references sf.leagues(id) on delete cascade,
  entry_id bigint not null references sf.entries(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, entry_id)
);

-- ---------------------------------------------------------------------------
-- Operations.
-- ---------------------------------------------------------------------------
create table sf.sim_runs (
  id bigint generated always as identity primary key,
  job text not null,
  season_id bigint,
  round int,
  status text not null check (status in ('ok', 'noop', 'error')),
  detail jsonb,
  created_at timestamptz not null default now()
);

create table sf.corrections (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_key jsonb not null,
  before jsonb,
  after jsonb,
  reason text not null,
  made_by text not null,
  made_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Immutability: final rows never change (fixes go through sf.corrections with
-- the session setting sf.correction = on, set only inside a correction function).
-- ---------------------------------------------------------------------------
create or replace function sf.refuse_change() returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('sf.correction', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'sf.%: final rows are immutable (use a correction)', tg_table_name;
end $$;
create trigger sf_match_results_immutable before update or delete on sf.match_results for each row execute function sf.refuse_change();
create trigger sf_match_events_immutable before update or delete on sf.match_events for each row execute function sf.refuse_change();
create trigger sf_pms_immutable before update or delete on sf.player_match_stats for each row execute function sf.refuse_change();
-- a manager's own rows may still go when the account is deleted (cascade), never change
create trigger sf_scores_immutable before update on sf.entry_round_scores for each row execute function sf.refuse_change();
create trigger sf_snapshots_immutable before update on sf.entry_round_snapshots for each row execute function sf.refuse_change();
create trigger sf_engine_snapshots_immutable before update or delete on sf.engine_snapshots for each row execute function sf.refuse_change();

-- ---------------------------------------------------------------------------
-- Helpers.
-- ---------------------------------------------------------------------------
-- Prototype flag: a universe is visible if public, or to admins.
create or replace function sf.universe_visible(u text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from sf.universes x where x.id = u and x.is_public) or public.is_admin()
$$;
create or replace function sf.season_visible(s bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from sf.seasons x join sf.universes u on u.id = x.universe_id where x.id = s and u.is_public) or public.is_admin()
$$;

-- rights review (design §7): provenance notes stay private, only the verdict is used
create or replace function sf.identity_approved(p bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from sf.identity_provenance where id = p and rights_status = 'approved')
$$;

create or replace function sf.season_universe(s bigint) returns text
language sql stable security definer set search_path = '' as $$ select universe_id from sf.seasons where id = s $$;

-- Current price of a player.
create or replace function sf.price(p_season bigint, p_player text) returns int
language sql stable security definer set search_path = '' as $$
  select price from sf.player_prices where season_id = p_season and player_id = p_player
    and from_round <= coalesce((select min(number) from sf.rounds where season_id = p_season and state <> 'final'), 10)
  order by from_round desc limit 1
$$;

-- FPL's selling price: half of any rise (rounded down), all of a fall.
create or replace function sf.selling_price(p_purchase int, p_now int) returns int
language sql immutable set search_path = '' as $$
  select case when p_now <= p_purchase then p_now else p_purchase + (p_now - p_purchase) / 2 end
$$;

-- The round open for changes now (null between deadline and results).
create or replace function sf.open_round(p_season bigint) returns int
language sql stable security definer set search_path = '' as $$
  select number from sf.rounds where season_id = p_season and state = 'open' order by number limit 1
$$;

-- ---------------------------------------------------------------------------
-- Saving a team: the one place squad rules are enforced in the database.
-- p = {picks: [{player_id, slot}] (15), captain, vice, wildcard?: bool}
-- ---------------------------------------------------------------------------
create or replace function sf.save_team(p_entry bigint, p jsonb, p_check_deadline boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e sf.entries%rowtype;
  rules jsonb;
  r int;
  dl timestamptz;
  u text;
  pos text;
  n int;
  v_bank int;
  v_new int;
  first_deadline boolean;
  problems text[] := '{}';
  cap text := p->>'captain';
  vice text := p->>'vice';
begin
  select * into e from sf.entries where id = p_entry for update;
  if not found then raise exception 'no such entry'; end if;
  select s.universe_id, g.rules into u, rules from sf.seasons s join sf.game_rules g on g.version = s.rules_version where s.id = e.season_id;
  r := sf.open_round(e.season_id);
  if r is null then raise exception 'the round is locked: changes open again after the results'; end if;
  select deadline_at into dl from sf.rounds where season_id = e.season_id and number = r;
  if p_check_deadline and now() >= dl then raise exception 'the deadline has passed'; end if;

  create temp table if not exists _sf_new (player_id text primary key, slot int unique, position text, club_id text, price int, purchase int, kept boolean) on commit drop;
  truncate _sf_new;
  begin
    insert into _sf_new (player_id, slot)
    select x->>'player_id', (x->>'slot')::int from jsonb_array_elements(p->'picks') x;
  exception when unique_violation then raise exception 'a player or a slot is used twice';
  end;
  update _sf_new t set position = pl.position, club_id = pl.club_id, price = sf.price(e.season_id, t.player_id)
    from sf.players pl where pl.universe_id = u and pl.id = t.player_id;
  update _sf_new t set purchase = ep.purchase_price, kept = true from sf.entry_picks ep where ep.entry_id = p_entry and ep.player_id = t.player_id;
  update _sf_new set kept = false where kept is null;

  if (select count(*) from _sf_new) <> 15 then problems := problems || format('%s players, not 15', (select count(*) from _sf_new)); end if;
  if exists (select 1 from _sf_new where position is null or price is null) then problems := problems || 'unknown player'::text; end if;
  if exists (select 1 from _sf_new where slot not between 1 and 15) then problems := problems || 'slots are 1–15'::text; end if;
  foreach pos in array array['GK', 'DEF', 'MID', 'FWD'] loop
    select count(*) into n from _sf_new where position = pos;
    if n <> (rules->'squad'->>pos)::int then problems := problems || format('%s %s, not %s', n, pos, rules->'squad'->>pos); end if;
    select count(*) into n from _sf_new where position = pos and slot <= 11;
    if n < (rules->'xiMin'->>pos)::int or n > (rules->'xiMax'->>pos)::int then
      problems := problems || format('%s %s in the XI (%s–%s)', n, pos, rules->'xiMin'->>pos, rules->'xiMax'->>pos);
    end if;
  end loop;
  if exists (select 1 from _sf_new group by club_id having count(*) > (rules->>'maxPerClub')::int) then
    problems := problems || format('more than %s from one club', rules->>'maxPerClub');
  end if;
  if not exists (select 1 from _sf_new where slot = 12 and position = 'GK') then problems := problems || 'the first bench place is the reserve keeper'::text; end if;
  if not exists (select 1 from _sf_new where player_id = cap and slot <= 11) then problems := problems || 'the captain must be in the XI'::text; end if;
  if cap = vice or not exists (select 1 from _sf_new where player_id = vice and slot <= 11) then problems := problems || 'the vice-captain must be another player in the XI'::text; end if;

  -- money: before the first deadline the whole budget; afterwards sell at selling prices, buy at today's
  first_deadline := not exists (select 1 from sf.entry_round_snapshots s where s.entry_id = p_entry);
  if first_deadline then
    v_bank := (rules->>'budget')::int - (select coalesce(sum(price), 0) from _sf_new);
  else
    v_bank := e.bank
      + (select coalesce(sum(sf.selling_price(ep.purchase_price, sf.price(e.season_id, ep.player_id))), 0)
         from sf.entry_picks ep where ep.entry_id = p_entry and not exists (select 1 from _sf_new t where t.player_id = ep.player_id))
      - (select coalesce(sum(price), 0) from _sf_new where not kept);
  end if;
  if v_bank < 0 then problems := problems || format('over budget by %s', -v_bank / 10.0); end if;
  if array_length(problems, 1) > 0 then raise exception 'team not saved: %', array_to_string(problems, '; '); end if;

  select count(*) into v_new from _sf_new where not kept;
  if not first_deadline and v_new > 0 then
    if coalesce((p->>'wildcard')::boolean, false) and not e.wildcard_this_round then
      if e.wildcards_left < 1 then raise exception 'no wildcard left'; end if;
      e.wildcard_this_round := true; e.wildcards_left := e.wildcards_left - 1;
    end if;
    -- a transfer row per player in, paired with a player out of the same position
    insert into sf.transfers (entry_id, round, player_out, player_in, price_out, price_in, wildcard)
    select p_entry, r, o.player_id, i.player_id, sf.selling_price(o.purchase_price, sf.price(e.season_id, o.player_id)), i.price, e.wildcard_this_round
    from (select t.*, row_number() over (partition by position order by player_id) k from _sf_new t where not kept) i
    join (select ep.*, pl.position, row_number() over (partition by pl.position order by ep.player_id) k
          from sf.entry_picks ep join sf.players pl on pl.universe_id = u and pl.id = ep.player_id
          where ep.entry_id = p_entry and not exists (select 1 from _sf_new t where t.player_id = ep.player_id)) o
      on o.position = i.position and o.k = i.k;
    e.transfers_this_round := e.transfers_this_round + v_new;
  end if;

  delete from sf.entry_picks where entry_id = p_entry;
  insert into sf.entry_picks (entry_id, player_id, slot, is_captain, is_vice, purchase_price)
  select p_entry, player_id, slot, player_id = cap, player_id = vice, case when kept then purchase else price end from _sf_new;
  update sf.entries set bank = v_bank, transfers_this_round = e.transfers_this_round,
    wildcard_this_round = e.wildcard_this_round, wildcards_left = e.wildcards_left where id = p_entry;

  return jsonb_build_object('round', r, 'bank', v_bank, 'transfers', e.transfers_this_round,
    'free_transfers', e.free_transfers, 'wildcard', e.wildcard_this_round,
    'hits_if_deadline_now', case when first_deadline or e.wildcard_this_round then 0
      else greatest(0, e.transfers_this_round - e.free_transfers) * (rules->>'hit')::int end);
end $$;
revoke all on function sf.save_team(bigint, jsonb, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- For signed-in managers (admins only while the universe is not public).
-- ---------------------------------------------------------------------------
create or replace function public.sf_join(p_season bigint, p_team_name text, p_display_name text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare m bigint; e bigint; r int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not sf.season_visible(p_season) then raise exception 'not available'; end if;
  r := sf.open_round(p_season);
  if r is null then raise exception 'joining opens again after the results'; end if;
  insert into sf.fantasy_managers (user_id, display_name)
  values (auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Manager'))
  on conflict (user_id) do nothing;
  select id into m from sf.fantasy_managers where user_id = auth.uid();
  insert into sf.entries (manager_id, season_id, team_name, joined_round, bank)
  values (m, p_season, trim(p_team_name), r, 0)
  on conflict (manager_id, season_id) do nothing;
  select id into e from sf.entries where manager_id = m and season_id = p_season;
  insert into sf.league_members (league_id, entry_id)
  select l.id, e from sf.leagues l where l.season_id = p_season and l.kind = 'public' on conflict do nothing;
  return e;
end $$;
revoke all on function public.sf_join(bigint, text, text) from public, anon;
grant execute on function public.sf_join(bigint, text, text) to authenticated;

create or replace function public.sf_save_team(p_season bigint, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e bigint;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not sf.season_visible(p_season) then raise exception 'not available'; end if;
  select en.id into e from sf.entries en join sf.fantasy_managers m on m.id = en.manager_id
  where m.user_id = auth.uid() and en.season_id = p_season;
  if e is null then raise exception 'join the season first'; end if;
  return sf.save_team(e, p, true);
end $$;
revoke all on function public.sf_save_team(bigint, jsonb) from public, anon;
grant execute on function public.sf_save_team(bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- For the round runner (service_role only).
-- ---------------------------------------------------------------------------
-- Create a universe and its first season from the engine's output.
-- p = {universe:{id,name,seed,engine_version}, world, managers:[], clubs:[], players:[], hidden:[{player_id, attrs}],
--      season:{number, rules_version, scoring_version}, rounds:[{number,kind,deadline_at,kickoff_at}],
--      fixtures:[{round,fixture_key,home_id,away_id,kind}], scouting:[], prices:[{player_id,price,inputs}],
--      season_players:[{player_id,start_price,expected_per_round}], projections:[], snapshot:{state,hash}}
create or replace function public.sf_create_season(p jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare u text := p->'universe'->>'id'; s bigint; num int := (p->'season'->>'number')::int;
begin
  select id into s from sf.seasons where universe_id = u and number = num;
  if s is not null then return s; end if;   -- already created: safe to re-run
  insert into sf.universes (id, name, seed, engine_version)
  values (u, p->'universe'->>'name', p->'universe'->>'seed', p->'universe'->>'engine_version') on conflict (id) do nothing;
  insert into sf.worlds (universe_id, world) values (u, p->'world') on conflict (universe_id) do nothing;
  insert into sf.managers (universe_id, id, name, rotation, attack_lean, formations)
  select u, x->>'id', x->>'name', (x->>'rotation')::numeric, (x->>'attackLean')::numeric, array(select jsonb_array_elements_text(x->'formations'))
  from jsonb_array_elements(p->'managers') x on conflict do nothing;
  insert into sf.clubs (universe_id, id, name, short, manager_id, home_boost)
  select u, x->>'id', x->>'name', x->>'short', x->>'managerId', (x->>'homeBoost')::numeric
  from jsonb_array_elements(p->'clubs') x on conflict do nothing;
  insert into sf.players (universe_id, id, club_id, name, nationality, age, position, identity_category)
  select u, x->>'id', x->>'clubId', x->>'name', x->>'nationality', (x->>'age')::int, x->>'position', 'original'
  from jsonb_array_elements(p->'players') x on conflict do nothing;
  insert into sf.player_hidden (universe_id, player_id, season, attrs)
  select u, x->>'player_id', num, x->'attrs' from jsonb_array_elements(p->'hidden') x on conflict do nothing;

  insert into sf.seasons (universe_id, number, state, rules_version, scoring_version)
  values (u, num, 'live', p->'season'->>'rules_version', p->'season'->>'scoring_version') returning id into s;
  insert into sf.rounds (season_id, number, kind, deadline_at, kickoff_at, state)
  select s, (x->>'number')::int, x->>'kind', (x->>'deadline_at')::timestamptz, (x->>'kickoff_at')::timestamptz,
    case when (x->>'number')::int = 1 then 'open' else 'upcoming' end
  from jsonb_array_elements(p->'rounds') x;
  insert into sf.fixtures (season_id, round, fixture_key, home_id, away_id, kind)
  select s, (x->>'round')::int, x->>'fixture_key', x->>'home_id', x->>'away_id', x->>'kind' from jsonb_array_elements(p->'fixtures') x;
  insert into sf.scouting (season_id, player_id, attack, creativity, defence, keeping, discipline)
  select s, x->>'player_id', (x->>'attack')::int, (x->>'creativity')::int, (x->>'defence')::int, (x->>'keeping')::int, (x->>'discipline')::int
  from jsonb_array_elements(p->'scouting') x;
  insert into sf.player_status (season_id, player_id) select s, x->>'id' from jsonb_array_elements(p->'players') x;
  insert into sf.player_prices (season_id, player_id, from_round, price, reason, inputs)
  select s, x->>'player_id', 1, (x->>'price')::int, 'initial', x->'inputs' from jsonb_array_elements(p->'prices') x;
  insert into sf.season_players (season_id, player_id, start_price, expected_per_round)
  select s, x->>'player_id', (x->>'start_price')::int, (x->>'expected_per_round')::numeric from jsonb_array_elements(p->'season_players') x;
  insert into sf.projections (season_id, round, player_id, made_after_round, x_points, p_start, x_minutes, x_goals, x_assists, p_clean_sheet)
  select s, (x->>'round')::int, x->>'player_id', 0, (x->>'x_points')::numeric, (x->>'p_start')::numeric, (x->>'x_minutes')::numeric,
    (x->>'x_goals')::numeric, (x->>'x_assists')::numeric, (x->>'p_clean_sheet')::numeric
  from jsonb_array_elements(p->'projections') x;
  insert into sf.engine_snapshots (season_id, after_round, engine_version, state, state_hash)
  values (s, 0, p->'universe'->>'engine_version', p->'snapshot'->'state', p->'snapshot'->>'hash');
  insert into sf.leagues (season_id, name, kind) values (s, 'Everyone', 'public');
  insert into sf.sim_runs (job, season_id, round, status, detail) values ('create_season', s, 0, 'ok', jsonb_build_object('universe', u));
  return s;
end $$;
revoke all on function public.sf_create_season(jsonb) from public, anon, authenticated;
grant execute on function public.sf_create_season(jsonb) to service_role;

-- A bot manager and its entry (idempotent).
create or replace function public.sf_ensure_bot(p_season bigint, p_kind text, p_key text, p_name text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare m bigint; e bigint; r int;
begin
  insert into sf.fantasy_managers (display_name, is_bot, bot_kind, bot_key) values (p_name, true, p_kind, p_key)
  on conflict (bot_key) do nothing;
  select id into m from sf.fantasy_managers where bot_key = p_key;
  select id into e from sf.entries where manager_id = m and season_id = p_season;
  if e is null then
    r := sf.open_round(p_season);
    if r is null then raise exception 'no open round'; end if;
    insert into sf.entries (manager_id, season_id, team_name, joined_round) values (m, p_season, p_name, r) returning id into e;
    insert into sf.league_members (league_id, entry_id)
    select l.id, e from sf.leagues l where l.season_id = p_season and l.kind = 'public' on conflict do nothing;
  end if;
  return e;
end $$;
revoke all on function public.sf_ensure_bot(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.sf_ensure_bot(bigint, text, text, text) to service_role;

create or replace function public.sf_bot_save_team(p_entry bigint, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from sf.entries e join sf.fantasy_managers m on m.id = e.manager_id where e.id = p_entry and m.is_bot) then
    raise exception 'not a bot entry';
  end if;
  return sf.save_team(p_entry, p, false);
end $$;
revoke all on function public.sf_bot_save_team(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.sf_bot_save_team(bigint, jsonb) to service_role;

-- The deadline: freeze every squad, charge hits, roll free transfers on. Idempotent:
-- a round already locked returns 'noop'. p_force lets the runner lock early
-- (test universes only: refused for a public universe).
create or replace function public.sf_lock_round(p_season bigint, p_round int, p_force boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare rd sf.rounds%rowtype; rules jsonb; pub boolean; n int;
begin
  select * into rd from sf.rounds where season_id = p_season and number = p_round for update;
  if not found then raise exception 'no such round'; end if;
  if rd.state <> 'open' then
    insert into sf.sim_runs (job, season_id, round, status, detail) values ('lock', p_season, p_round, 'noop', jsonb_build_object('state', rd.state));
    return 'noop';
  end if;
  select u.is_public into pub from sf.seasons s join sf.universes u on u.id = s.universe_id where s.id = p_season;
  if now() < rd.deadline_at and not (p_force and not pub) then raise exception 'before the deadline'; end if;
  select g.rules into rules from sf.seasons s join sf.game_rules g on g.version = s.rules_version where s.id = p_season;

  insert into sf.entry_round_snapshots (entry_id, round, picks, bank, transfers, hits, wildcard)
  select e.id, p_round,
    (select jsonb_agg(jsonb_build_object('player_id', ep.player_id, 'slot', ep.slot, 'is_captain', ep.is_captain,
       'is_vice', ep.is_vice, 'purchase_price', ep.purchase_price) order by ep.slot) from sf.entry_picks ep where ep.entry_id = e.id),
    e.bank, e.transfers_this_round,
    case when e.joined_round = p_round or e.wildcard_this_round then 0
      else greatest(0, e.transfers_this_round - e.free_transfers) * (rules->>'hit')::int end,
    e.wildcard_this_round
  from sf.entries e
  where e.season_id = p_season and exists (select 1 from sf.entry_picks ep where ep.entry_id = e.id)
  on conflict do nothing;
  get diagnostics n = row_count;

  update sf.entries e set
    free_transfers = case when e.joined_round = p_round then e.free_transfers
      else least((rules->>'maxBankedTransfers')::int,
        e.free_transfers - case when e.wildcard_this_round then 0 else least(e.free_transfers, e.transfers_this_round) end
        + (rules->>'freeTransfersPerRound')::int) end,
    transfers_this_round = 0, wildcard_this_round = false
  where e.season_id = p_season and exists (select 1 from sf.entry_round_snapshots s where s.entry_id = e.id and s.round = p_round);
  -- an entry that joined and never picked moves its first deadline on
  update sf.entries e set joined_round = p_round + 1
  where e.season_id = p_season and e.joined_round = p_round and not exists (select 1 from sf.entry_picks ep where ep.entry_id = e.id);

  -- locked early (test universes): the round's clock moves back so it has already kicked off and
  -- finished (105 minutes), and its results show as soon as they are committed
  update sf.rounds set state = 'locked', locked_at = now(),
    deadline_at = case when now() < deadline_at then now() - interval '105 minutes' else deadline_at end,
    kickoff_at = case when now() < deadline_at then now() - interval '105 minutes' else kickoff_at end
  where season_id = p_season and number = p_round;
  insert into sf.sim_runs (job, season_id, round, status, detail)
  values ('lock', p_season, p_round, 'ok', jsonb_build_object('snapshots', n, 'early', now() < rd.deadline_at));
  return 'ok';
end $$;
revoke all on function public.sf_lock_round(bigint, int, boolean) from public, anon, authenticated;
grant execute on function public.sf_lock_round(bigint, int, boolean) to service_role;

-- Everything the runner needs for the next step.
create or replace function public.sf_runner_state(p_universe text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with s as (select * from sf.seasons where universe_id = p_universe order by number desc limit 1),
  cur as (select min(number) n from sf.rounds where season_id = (select id from s) and state <> 'final')
  select case when not exists (select 1 from s) then null else jsonb_build_object(
    'season', (select to_jsonb(s) from s),
    'world', (select world from sf.worlds where universe_id = p_universe),
    'snapshot', (select jsonb_build_object('after_round', after_round, 'state', state, 'hash', state_hash)
                 from sf.engine_snapshots where season_id = (select id from s) order by after_round desc limit 1),
    'round', (select to_jsonb(r) from sf.rounds r where r.season_id = (select id from s) and r.number = (select n from cur)),
    'fixtures', (select coalesce(jsonb_agg(to_jsonb(f) order by f.id), '[]') from sf.fixtures f where f.season_id = (select id from s)),
    'prices', (select coalesce(jsonb_object_agg(sp.player_id, sf.price(sp.season_id, sp.player_id)), '{}') from sf.season_players sp where sp.season_id = (select id from s)),
    'season_players', (select coalesce(jsonb_agg(to_jsonb(sp)), '[]') from sf.season_players sp where sp.season_id = (select id from s)),
    'entries', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'bank', e.bank, 'free_transfers', e.free_transfers, 'wildcards_left', e.wildcards_left,
        'transfers_this_round', e.transfers_this_round, 'wildcard_this_round', e.wildcard_this_round, 'joined_round', e.joined_round,
        'is_bot', m.is_bot, 'bot_kind', m.bot_kind, 'bot_key', m.bot_key,
        'picks', (select coalesce(jsonb_agg(to_jsonb(ep) order by ep.slot), '[]') from sf.entry_picks ep where ep.entry_id = e.id),
        'snapshot', (select to_jsonb(x) from sf.entry_round_snapshots x where x.entry_id = e.id and x.round = (select n from cur))
      ) order by e.id), '[]') from sf.entries e join sf.fantasy_managers m on m.id = e.manager_id where e.season_id = (select id from s))
  ) end
$$;
revoke all on function public.sf_runner_state(text) from public, anon, authenticated;
grant execute on function public.sf_runner_state(text) to service_role;

-- Results: one transaction for the whole round. Refuses unless the round is
-- locked and none of its fixtures is final; every fixture of the round must be
-- in the payload, and nothing else.
-- p = {season_id, round, engine_version, snapshot:{state,hash}, results:[{fixture_key, home_goals, away_goals,
--      xg_home, xg_away, shootout, seed, events:[], stats:[]}], scores:[{entry_id, points, captain_used, subs}],
--      status:[{player_id, available_from}], prices:[{player_id, price, inputs}], projections:[],
--      next_fixtures:[{round, fixture_key, home_id, away_id, kind}], shield_winner}
create or replace function public.sf_commit_round(p jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare s bigint := (p->>'season_id')::bigint; r int := (p->>'round')::int; rd sf.rounds%rowtype; ss sf.seasons%rowtype;
begin
  select * into ss from sf.seasons where id = s;
  select * into rd from sf.rounds where season_id = s and number = r for update;
  if not found then raise exception 'no such round'; end if;
  if rd.state = 'final' then
    insert into sf.sim_runs (job, season_id, round, status) values ('commit', s, r, 'noop');
    return 'noop';
  end if;
  if rd.state <> 'locked' then raise exception 'round % is %, not locked', r, rd.state; end if;
  if exists (select 1 from sf.fixtures where season_id = s and round = r and state = 'final') then raise exception 'a fixture of round % is already final', r; end if;
  if (select count(*) from sf.fixtures where season_id = s and round = r) <> jsonb_array_length(p->'results')
     or exists (select 1 from jsonb_array_elements(p->'results') x where not exists (
       select 1 from sf.fixtures f where f.season_id = s and f.round = r and f.fixture_key = x->>'fixture_key')) then
    raise exception 'the results do not match the fixtures of round %', r;
  end if;
  if not exists (select 1 from sf.engine_snapshots where season_id = s and after_round = r - 1) then raise exception 'no engine state after round %', r - 1; end if;

  insert into sf.match_results (fixture_id, home_goals, away_goals, xg_home, xg_away, shootout, seed, engine_version)
  select f.id, (x->>'home_goals')::int, (x->>'away_goals')::int, (x->>'xg_home')::numeric, (x->>'xg_away')::numeric,
    x->'shootout', x->>'seed', p->>'engine_version'
  from jsonb_array_elements(p->'results') x join sf.fixtures f on f.fixture_key = x->>'fixture_key';
  insert into sf.match_events (fixture_id, seq, minute, type, side, player_id, detail)
  select f.id, (ev->>'seq')::int, (ev->>'minute')::int, ev->>'type', ev->>'side', ev->>'playerId', ev->'detail'
  from jsonb_array_elements(p->'results') x join sf.fixtures f on f.fixture_key = x->>'fixture_key', jsonb_array_elements(x->'events') ev;
  insert into sf.player_match_stats (fixture_id, player_id, side, position, started, minutes, goals, assists, own_goals,
    pen_misses, pen_saves, saves, conceded, yellow, red, clean_sheet, injured, bonus, points)
  select f.id, st->>'playerId', st->>'side', st->>'position', (st->>'started')::boolean, (st->>'minutes')::int,
    (st->>'goals')::int, (st->>'assists')::int, (st->>'ownGoals')::int, (st->>'penMisses')::int, (st->>'penSaves')::int,
    (st->>'saves')::int, (st->>'conceded')::int, (st->>'yellow')::int, (st->>'red')::int, (st->>'cleanSheet')::boolean,
    (st->>'injured')::boolean, coalesce((st->>'bonus')::int, 0), (st->>'points')::int
  from jsonb_array_elements(p->'results') x join sf.fixtures f on f.fixture_key = x->>'fixture_key', jsonb_array_elements(x->'stats') st;
  update sf.fixtures set state = 'final' where season_id = s and round = r;

  -- scores: every frozen squad gets one, with its hits
  if exists (select 1 from sf.entry_round_snapshots sn join sf.entries e on e.id = sn.entry_id
             where e.season_id = s and sn.round = r
               and not exists (select 1 from jsonb_array_elements(p->'scores') x where (x->>'entry_id')::bigint = sn.entry_id)) then
    raise exception 'a frozen squad has no score';
  end if;
  insert into sf.entry_round_scores (entry_id, round, points, hits, total, captain_used, subs, rules_version, scoring_version)
  select sn.entry_id, r, (x->>'points')::int, sn.hits, (x->>'points')::int - sn.hits, x->>'captain_used', coalesce(x->'subs', '[]'),
    ss.rules_version, ss.scoring_version
  from jsonb_array_elements(p->'scores') x join sf.entry_round_snapshots sn on sn.entry_id = (x->>'entry_id')::bigint and sn.round = r;

  insert into sf.engine_snapshots (season_id, after_round, engine_version, state, state_hash)
  values (s, r, p->>'engine_version', p->'snapshot'->'state', p->'snapshot'->>'hash');
  update sf.player_status ps set available_from = (x->>'available_from')::int, updated_after_round = r
  from jsonb_array_elements(p->'status') x where ps.season_id = s and ps.player_id = x->>'player_id';
  if r < 10 then
    insert into sf.player_prices (season_id, player_id, from_round, price, reason, inputs)
    select s, x->>'player_id', r + 1, (x->>'price')::int, 'form', x->'inputs' from jsonb_array_elements(p->'prices') x;
  end if;
  insert into sf.fixtures (season_id, round, fixture_key, home_id, away_id, kind)
  select s, (x->>'round')::int, x->>'fixture_key', x->>'home_id', x->>'away_id', x->>'kind' from jsonb_array_elements(coalesce(p->'next_fixtures', '[]')) x;
  insert into sf.projections (season_id, round, player_id, made_after_round, x_points, p_start, x_minutes, x_goals, x_assists, p_clean_sheet)
  select s, (x->>'round')::int, x->>'player_id', r, (x->>'x_points')::numeric, (x->>'p_start')::numeric, (x->>'x_minutes')::numeric,
    (x->>'x_goals')::numeric, (x->>'x_assists')::numeric, (x->>'p_clean_sheet')::numeric
  from jsonb_array_elements(coalesce(p->'projections', '[]')) x
  on conflict (season_id, round, player_id) do update set made_after_round = excluded.made_after_round, x_points = excluded.x_points,
    p_start = excluded.p_start, x_minutes = excluded.x_minutes, x_goals = excluded.x_goals, x_assists = excluded.x_assists,
    p_clean_sheet = excluded.p_clean_sheet;

  update sf.rounds set state = 'final', finalised_at = now() where season_id = s and number = r;
  if r < 10 then
    update sf.rounds set state = 'open' where season_id = s and number = r + 1;
    if r = 9 then update sf.seasons set state = 'finals' where id = s; end if;
  else
    update sf.seasons set state = 'done', shield_winner = p->>'shield_winner' where id = s;
  end if;
  insert into sf.sim_runs (job, season_id, round, status, detail)
  values ('commit', s, r, 'ok', jsonb_build_object('results', jsonb_array_length(p->'results'), 'scores', jsonb_array_length(p->'scores')));
  return 'ok';
end $$;
revoke all on function public.sf_commit_round(jsonb) from public, anon, authenticated;
grant execute on function public.sf_commit_round(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Grants and row security. Hidden tables (worlds, player_hidden,
-- engine_snapshots) get no grant at all. Everything else is readable where
-- its universe is visible; user picks only by their owner.
-- ---------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['game_rules','universes','worlds','managers','identity_provenance','clubs','players','player_hidden',
    'seasons','rounds','fixtures','engine_snapshots','match_results','match_events','player_match_stats','scouting','player_status',
    'player_prices','season_players','projections','fantasy_managers','entries','entry_picks','entry_round_snapshots','transfers',
    'entry_round_scores','leagues','league_members','sim_runs','corrections'] loop
    execute format('alter table sf.%I enable row level security', t);
    execute format('grant all on sf.%I to service_role', t);
  end loop;
  foreach t in array array['game_rules','universes','managers','clubs','players','seasons','rounds','fixtures','match_results',
    'match_events','player_match_stats','scouting','player_status','player_prices','season_players','projections',
    'fantasy_managers','entries','entry_picks','entry_round_snapshots','transfers','entry_round_scores','leagues','league_members'] loop
    execute format('grant select on sf.%I to anon, authenticated', t);
  end loop;
end $$;

create policy "read" on sf.game_rules for select to anon, authenticated using (true);
create policy "read" on sf.universes for select to anon, authenticated using (sf.universe_visible(id));
create policy "read" on sf.managers for select to anon, authenticated using (sf.universe_visible(universe_id));
create policy "read" on sf.clubs for select to anon, authenticated using (sf.universe_visible(universe_id));
create policy "read" on sf.players for select to anon, authenticated using (sf.universe_visible(universe_id));
create policy "read" on sf.seasons for select to anon, authenticated using (sf.universe_visible(universe_id));
create policy "read" on sf.rounds for select to anon, authenticated using (sf.season_visible(season_id));
create policy "read" on sf.fixtures for select to anon, authenticated using (sf.season_visible(season_id));
create policy "read" on sf.scouting for select to anon, authenticated using (sf.season_visible(season_id));
create policy "read" on sf.player_status for select to anon, authenticated using (sf.season_visible(season_id));
create policy "read" on sf.player_prices for select to anon, authenticated using (sf.season_visible(season_id));
create policy "read" on sf.season_players for select to anon, authenticated using (sf.season_visible(season_id));
create policy "read" on sf.projections for select to anon, authenticated using (sf.season_visible(season_id));
create policy "read" on sf.leagues for select to anon, authenticated using (sf.season_visible(season_id));
-- match rows: visible once the fixture's season is; the public views add the live reveal by minute
create policy "read" on sf.match_results for select to anon, authenticated
  using (exists (select 1 from sf.fixtures f where f.id = fixture_id and sf.season_visible(f.season_id)));
create policy "read" on sf.match_events for select to anon, authenticated
  using (exists (select 1 from sf.fixtures f where f.id = fixture_id and sf.season_visible(f.season_id)));
create policy "read" on sf.player_match_stats for select to anon, authenticated
  using (exists (select 1 from sf.fixtures f where f.id = fixture_id and sf.season_visible(f.season_id)));
-- fantasy: names, entries, frozen squads, transfers and scores are public (as in FPL, after the deadline);
-- current picks only to their owner
create policy "read" on sf.fantasy_managers for select to anon, authenticated using (true);
create policy "read" on sf.entries for select to anon, authenticated using (sf.season_visible(season_id));
create policy "own" on sf.entry_picks for select to authenticated
  using (exists (select 1 from sf.entries e join sf.fantasy_managers m on m.id = e.manager_id where e.id = entry_id and m.user_id = auth.uid()));
create policy "read" on sf.entry_round_snapshots for select to anon, authenticated
  using (exists (select 1 from sf.entries e where e.id = entry_id and sf.season_visible(e.season_id)));
create policy "read" on sf.transfers for select to anon, authenticated
  using (exists (select 1 from sf.entries e join sf.rounds r on r.season_id = e.season_id and r.number = round
                 where e.id = entry_id and sf.season_visible(e.season_id) and r.state <> 'open'));
create policy "read" on sf.entry_round_scores for select to anon, authenticated
  using (exists (select 1 from sf.entries e where e.id = entry_id and sf.season_visible(e.season_id)));
create policy "read" on sf.league_members for select to anon, authenticated
  using (exists (select 1 from sf.entries e where e.id = entry_id and sf.season_visible(e.season_id)));

-- ---------------------------------------------------------------------------
-- Public views. Match events appear live by match minute after kick-off
-- (the second half from 15 minutes after the first ends; full time = minute 90).
-- ---------------------------------------------------------------------------
create or replace function sf.reveal_at(p_kickoff timestamptz, p_minute int) returns timestamptz
language sql immutable set search_path = '' as $$
  select p_kickoff + make_interval(mins => p_minute + case when p_minute > 45 then 15 else 0 end)
$$;

create view public.sf_seasons with (security_invoker = true) as
select s.id season_id, s.universe_id, u.name universe, s.number, s.state, s.rules_version, s.scoring_version, s.shield_winner,
  (select min(r.number) from sf.rounds r where r.season_id = s.id and r.state <> 'final') current_round,
  (select r.number from sf.rounds r where r.season_id = s.id and r.state = 'open' order by r.number limit 1) open_round
from sf.seasons s join sf.universes u on u.id = s.universe_id;

create view public.sf_rounds with (security_invoker = true) as
select season_id, number, kind, deadline_at, kickoff_at, state from sf.rounds;

create view public.sf_clubs with (security_invoker = true) as
select c.universe_id, c.id club_id, c.name, c.short, m.name manager, c.identity_category
from sf.clubs c join sf.managers m on m.universe_id = c.universe_id and m.id = c.manager_id;

create view public.sf_players with (security_invoker = true) as
select s.id season_id, p.universe_id, p.id player_id, p.name, p.club_id, c.short club, p.position, p.age, p.nationality,
  sf.price(s.id, p.id) price, sp.start_price,
  sc.attack, sc.creativity, sc.defence, sc.keeping, sc.discipline,
  st.available_from,
  (select coalesce(sum(x.points), 0) from sf.player_match_stats x join sf.fixtures f on f.id = x.fixture_id join sf.rounds r on r.season_id = f.season_id and r.number = f.round
   where x.player_id = p.id and f.season_id = s.id and now() >= sf.reveal_at(r.kickoff_at, 90)) total_points,
  (select pr.x_points from sf.projections pr where pr.season_id = s.id and pr.player_id = p.id
     and pr.round = (select min(r.number) from sf.rounds r where r.season_id = s.id and r.state <> 'final')) next_x_points
from sf.players p
join sf.seasons s on s.universe_id = p.universe_id
join sf.clubs c on c.universe_id = p.universe_id and c.id = p.club_id
left join sf.season_players sp on sp.season_id = s.id and sp.player_id = p.id
left join sf.scouting sc on sc.season_id = s.id and sc.player_id = p.id
left join sf.player_status st on st.season_id = s.id and st.player_id = p.id
where p.identity_category = 'original' or sf.identity_approved(p.provenance_id);

create view public.sf_fixtures with (security_invoker = true) as
select f.id fixture_id, f.season_id, f.round, f.kind, f.home_id, h.short home, f.away_id, a.short away, r.kickoff_at,
  case when f.state = 'final' and now() >= r.kickoff_at then
    case when now() >= sf.reveal_at(r.kickoff_at, 90) then 'full_time' else 'live' end else 'scheduled' end status,
  (select count(*) from sf.match_events e where e.fixture_id = f.id and e.type in ('goal', 'pen_goal', 'own_goal') and e.side = 'home'
     and now() >= sf.reveal_at(r.kickoff_at, e.minute))::int home_goals,
  (select count(*) from sf.match_events e where e.fixture_id = f.id and e.type in ('goal', 'pen_goal', 'own_goal') and e.side = 'away'
     and now() >= sf.reveal_at(r.kickoff_at, e.minute))::int away_goals,
  case when now() >= sf.reveal_at(r.kickoff_at, 90) then mr.shootout end shootout
from sf.fixtures f
join sf.rounds r on r.season_id = f.season_id and r.number = f.round
join sf.seasons s on s.id = f.season_id
join sf.clubs h on h.universe_id = s.universe_id and h.id = f.home_id
join sf.clubs a on a.universe_id = s.universe_id and a.id = f.away_id
left join sf.match_results mr on mr.fixture_id = f.id;

create view public.sf_match_events with (security_invoker = true) as
select e.fixture_id, e.seq, e.minute, e.type, e.side, e.player_id, p.name player, e.detail
from sf.match_events e
join sf.fixtures f on f.id = e.fixture_id
join sf.rounds r on r.season_id = f.season_id and r.number = f.round
join sf.seasons s on s.id = f.season_id
left join sf.players p on p.universe_id = s.universe_id and p.id = e.player_id
where e.type not in ('shot', 'kickoff') and now() >= sf.reveal_at(r.kickoff_at, e.minute);

-- player points per round: published at full time
create view public.sf_player_rounds with (security_invoker = true) as
select f.season_id, f.round, x.player_id, x.minutes, x.started, x.goals, x.assists, x.clean_sheet, x.saves, x.yellow, x.red, x.bonus, x.points
from sf.player_match_stats x
join sf.fixtures f on f.id = x.fixture_id
join sf.rounds r on r.season_id = f.season_id and r.number = f.round
where now() >= sf.reveal_at(r.kickoff_at, 90);

create view public.sf_projections with (security_invoker = true) as
select season_id, round, player_id, made_after_round, x_points, p_start, x_minutes, x_goals, x_assists, p_clean_sheet from sf.projections;

create view public.sf_price_history with (security_invoker = true) as
select season_id, player_id, from_round, price, reason, created_at from sf.player_prices;

create view public.sf_league_table with (security_invoker = true) as
with res as (
  select f.season_id, f.home_id club, mr.home_goals gf, mr.away_goals ga from sf.fixtures f join sf.match_results mr on mr.fixture_id = f.id
    join sf.rounds r on r.season_id = f.season_id and r.number = f.round where f.kind = 'league' and now() >= sf.reveal_at(r.kickoff_at, 90)
  union all
  select f.season_id, f.away_id, mr.away_goals, mr.home_goals from sf.fixtures f join sf.match_results mr on mr.fixture_id = f.id
    join sf.rounds r on r.season_id = f.season_id and r.number = f.round where f.kind = 'league' and now() >= sf.reveal_at(r.kickoff_at, 90)
)
select season_id, club club_id, count(*)::int p, count(*) filter (where gf > ga)::int w, count(*) filter (where gf = ga)::int d,
  count(*) filter (where gf < ga)::int l, sum(gf)::int gf, sum(ga)::int ga, (sum(gf) - sum(ga))::int gd,
  (3 * count(*) filter (where gf > ga) + count(*) filter (where gf = ga))::int pts
from res group by season_id, club;

-- the fantasy table: scores published at full time of the round
create view public.sf_leaderboard with (security_invoker = true) as
select e.season_id, e.id entry_id, e.team_name, m.display_name, m.is_bot, m.bot_kind, e.joined_round,
  coalesce(sum(sc.total), 0)::int total,
  coalesce(sum(sc.hits), 0)::int hits,
  (select x.total from sf.entry_round_scores x join sf.rounds r2 on r2.season_id = e.season_id and r2.number = x.round
   where x.entry_id = e.id and now() >= sf.reveal_at(r2.kickoff_at, 90) order by x.round desc limit 1) last_round
from sf.entries e
join sf.fantasy_managers m on m.id = e.manager_id
left join sf.entry_round_scores sc on sc.entry_id = e.id
  and exists (select 1 from sf.rounds r where r.season_id = e.season_id and r.number = sc.round and now() >= sf.reveal_at(r.kickoff_at, 90))
group by e.season_id, e.id, e.team_name, m.display_name, m.is_bot, m.bot_kind, e.joined_round;

create view public.sf_entry_rounds with (security_invoker = true) as
select sn.entry_id, sn.round, sn.picks, sn.bank, sn.transfers, sn.hits, sn.wildcard, sc.points, sc.total, sc.captain_used, sc.subs
from sf.entry_round_snapshots sn
join sf.entries e on e.id = sn.entry_id
join sf.rounds r on r.season_id = e.season_id and r.number = sn.round
left join sf.entry_round_scores sc on sc.entry_id = sn.entry_id and sc.round = sn.round and now() >= sf.reveal_at(r.kickoff_at, 90);

-- my entry and current squad (RLS on entry_picks limits it to the owner)
create view public.sf_my_team with (security_invoker = true) as
select e.season_id, e.id entry_id, e.team_name, e.bank, e.free_transfers, e.wildcards_left, e.transfers_this_round, e.wildcard_this_round,
  ep.player_id, ep.slot, ep.is_captain, ep.is_vice, ep.purchase_price,
  sf.price(e.season_id, ep.player_id) price, sf.selling_price(ep.purchase_price, sf.price(e.season_id, ep.player_id)) selling_price
from sf.entries e
join sf.fantasy_managers m on m.id = e.manager_id and m.user_id = auth.uid()
left join sf.entry_picks ep on ep.entry_id = e.id;

grant select on public.sf_seasons, public.sf_rounds, public.sf_clubs, public.sf_players, public.sf_fixtures, public.sf_match_events,
  public.sf_player_rounds, public.sf_projections, public.sf_price_history, public.sf_league_table, public.sf_leaderboard,
  public.sf_entry_rounds to anon, authenticated;
grant select on public.sf_my_team to authenticated;

-- helper functions used by views and policies
grant execute on function sf.universe_visible(text), sf.season_visible(bigint), sf.price(bigint, text), sf.selling_price(int, int),
  sf.reveal_at(timestamptz, int), sf.open_round(bigint), sf.season_universe(bigint), sf.identity_approved(bigint) to anon, authenticated, service_role;

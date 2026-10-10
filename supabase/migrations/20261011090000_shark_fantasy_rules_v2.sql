-- ============================================================================
-- Shark Fantasy: rules v2 for the Beat the Shark world (design update,
-- project doc claude/shark-fantasy-design-update-world-2026-10-10.md).
--
--   sf-game-2        your XI plus one sub (12), budget 90.0
--   sf-game-2-nosub  pick 11, all play, budget 86.0
-- Both: one points price scale across positions; any valid formation; the
-- squad's position counts within limits rather than fixed. The TypeScript
-- mirror is src/sharkfantasy/fantasy/rules.ts (pinned by the tests and by
-- scripts/sf/db-check.ts, which plays a season both ways).
--
-- sf.save_team now reads squadSize, squadMin and squadMax (falling back to
-- sf-game-1's fixed counts), and asks for a keeper first on the bench only
-- when the rules say so.
-- ============================================================================

insert into sf.game_rules (version, rules) values
  ('sf-game-2', '{"xiMin": {"GK": 1, "DEF": 3, "MID": 2, "FWD": 1}, "xiMax": {"GK": 1, "DEF": 5, "MID": 5, "FWD": 3}, "maxPerClub": 3, "captainMultiplier": 2, "freeTransfersPerRound": 1, "maxBankedTransfers": 3, "hit": 4, "wildcards": 1, "priceStepMax": 2, "priceSeasonMax": 6, "transferDrivenFrom": 200, "priceBand": {"GK": [40, 65], "DEF": [40, 85], "MID": [45, 125], "FWD": [45, 130]}, "priceScale": "points", "reserveKeeperFirst": false, "budget": 900, "squadSize": 12, "squadMin": {"GK": 1, "DEF": 3, "MID": 2, "FWD": 1}, "squadMax": {"GK": 2, "DEF": 6, "MID": 6, "FWD": 4}}'),
  ('sf-game-2-nosub', '{"xiMin": {"GK": 1, "DEF": 3, "MID": 2, "FWD": 1}, "xiMax": {"GK": 1, "DEF": 5, "MID": 5, "FWD": 3}, "maxPerClub": 3, "captainMultiplier": 2, "freeTransfersPerRound": 1, "maxBankedTransfers": 3, "hit": 4, "wildcards": 1, "priceStepMax": 2, "priceSeasonMax": 6, "transferDrivenFrom": 200, "priceBand": {"GK": [40, 65], "DEF": [40, 85], "MID": [45, 125], "FWD": [45, 130]}, "priceScale": "points", "reserveKeeperFirst": false, "budget": 860, "squadSize": 11, "squadMin": {"GK": 1, "DEF": 3, "MID": 2, "FWD": 1}, "squadMax": {"GK": 1, "DEF": 5, "MID": 5, "FWD": 3}}')
on conflict (version) do nothing;

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
  v_size int;
  v_min jsonb;
  v_max jsonb;
  cap text := p->>'captain';
  vice text := p->>'vice';
begin
  select * into e from sf.entries where id = p_entry for update;
  if not found then raise exception 'no such entry'; end if;
  select s.universe_id, g.rules into u, rules from sf.seasons s join sf.game_rules g on g.version = s.rules_version where s.id = e.season_id;
  -- sf-game-1 has squad (exact counts, 15); later rules have squadSize, squadMin, squadMax
  v_size := coalesce((rules->>'squadSize')::int, 15);
  v_min := coalesce(rules->'squadMin', rules->'squad');
  v_max := coalesce(rules->'squadMax', rules->'squad');
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

  if (select count(*) from _sf_new) <> v_size then problems := problems || format('%s players, not %s', (select count(*) from _sf_new), v_size); end if;
  if exists (select 1 from _sf_new where position is null or price is null) then problems := problems || 'unknown player'::text; end if;
  if exists (select 1 from _sf_new where slot not between 1 and v_size) then problems := problems || format('slots are 1–%s', v_size); end if;
  foreach pos in array array['GK', 'DEF', 'MID', 'FWD'] loop
    select count(*) into n from _sf_new where position = pos;
    if n < (v_min->>pos)::int or n > (v_max->>pos)::int then
      problems := problems || case when v_min->>pos = v_max->>pos then format('%s %s, not %s', n, pos, v_min->>pos)
        else format('%s %s (%s–%s)', n, pos, v_min->>pos, v_max->>pos) end;
    end if;
    select count(*) into n from _sf_new where position = pos and slot <= 11;
    if n < (rules->'xiMin'->>pos)::int or n > (rules->'xiMax'->>pos)::int then
      problems := problems || format('%s %s in the XI (%s–%s)', n, pos, rules->'xiMin'->>pos, rules->'xiMax'->>pos);
    end if;
  end loop;
  if exists (select 1 from _sf_new group by club_id having count(*) > (rules->>'maxPerClub')::int) then
    problems := problems || format('more than %s from one club', rules->>'maxPerClub');
  end if;
  if coalesce((rules->>'reserveKeeperFirst')::boolean, true) and v_size > 11 and not exists (select 1 from _sf_new where slot = 12 and position = 'GK') then
    problems := problems || 'the first bench place is the reserve keeper'::text;
  end if;
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

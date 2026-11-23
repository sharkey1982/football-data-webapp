-- Live definition exported from the database (function sf_lock_round(p_season bigint, p_round integer, p_force boolean)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.sf_lock_round(p_season bigint, p_round integer, p_force boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

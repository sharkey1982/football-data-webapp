-- Live definition exported from the database (function sf_runner_state(p_universe text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.sf_runner_state(p_universe text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

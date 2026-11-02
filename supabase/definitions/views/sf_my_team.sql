-- Live definition exported from the database (view sf_my_team).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.sf_my_team with (security_invoker=true) as
 SELECT e.season_id,
    e.id AS entry_id,
    e.team_name,
    e.bank,
    e.free_transfers,
    e.wildcards_left,
    e.transfers_this_round,
    e.wildcard_this_round,
    ep.player_id,
    ep.slot,
    ep.is_captain,
    ep.is_vice,
    ep.purchase_price,
    sf.price(e.season_id, ep.player_id) AS price,
    sf.selling_price(ep.purchase_price, sf.price(e.season_id, ep.player_id)) AS selling_price
   FROM ((sf.entries e
     JOIN sf.fantasy_managers m ON (((m.id = e.manager_id) AND (m.user_id = auth.uid()))))
     LEFT JOIN sf.entry_picks ep ON ((ep.entry_id = e.id)));

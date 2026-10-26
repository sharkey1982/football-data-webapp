-- Live definition exported from the database (view sf_price_history).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.sf_price_history with (security_invoker=true) as
 SELECT season_id,
    player_id,
    from_round,
    price,
    reason,
    created_at
   FROM sf.player_prices;

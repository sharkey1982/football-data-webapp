-- Live definition exported from the database (function get_betting_returns(p_edge numeric, p_market text, p_closing boolean, p_best_price boolean, p_stake numeric, p_season_id bigint, p_league_id bigint, p_promoted text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_betting_returns(p_edge numeric DEFAULT 0.05, p_market text DEFAULT '1x2'::text, p_closing boolean DEFAULT true, p_best_price boolean DEFAULT true, p_stake numeric DEFAULT 10, p_season_id bigint DEFAULT 13, p_league_id bigint DEFAULT NULL::bigint, p_promoted text DEFAULT 'all'::text)
 RETURNS TABLE(selection text, bets integer, staked numeric, returned numeric, profit numeric, roi_pct numeric, wins integer, hit_rate_pct numeric, avg_odds numeric, avg_edge_pct numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- A summary of get_betting_bets, so the bet list and these totals can never disagree.
  select b.selection, count(*)::integer,
    round(sum(b.stake), 2),
    round(sum(case when b.won then b.stake * b.price else 0 end), 2),
    round(sum(b.profit), 2),
    round(100 * sum(b.profit) / nullif(sum(b.stake), 0), 1),
    count(*) filter (where b.won)::integer,
    round(100.0 * count(*) filter (where b.won) / nullif(count(*), 0), 1),
    round(avg(b.price), 2),
    round(100 * avg(b.edge), 1)
  from public.get_betting_bets(p_edge, p_market, p_closing, p_best_price, p_stake, p_season_id, p_league_id, p_promoted) b
  group by b.selection order by b.selection;
$function$
;

-- Live definition exported from the database (function score_model_experiment(p_experiment text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.score_model_experiment(p_experiment text)
 RETURNS TABLE(variant text, league_id bigint, season_id bigint, n bigint, ll_model numeric, ll_market numeric, p_draw numeric, draws bigint, pred_goals numeric, goals bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with e as (select * from public.model_experiment_predictions where experiment = p_experiment),
  common as (select match_id from e group by match_id having count(distinct variant) = (select count(distinct variant) from e)),
  mk as (select o.match_id, 1/o.price_home ih, 1/o.price_draw id, 1/o.price_away ia from public.match_odds o
         where o.market = '1x2' and o.is_closing and o.bookmaker = 'Avg' and o.price_home > 1 and o.price_draw > 1 and o.price_away > 1)
  select e.variant, m.league_id, m.season_id, count(*),
    sum(-ln((case when m.full_time_home_goals > m.full_time_away_goals then e.p_home when m.full_time_home_goals = m.full_time_away_goals then e.p_draw else e.p_away end)::numeric)),
    sum(-ln(case when m.full_time_home_goals > m.full_time_away_goals then mk.ih when m.full_time_home_goals = m.full_time_away_goals then mk.id else mk.ia end / (mk.ih + mk.id + mk.ia))),
    sum(e.p_draw::numeric), count(*) filter (where m.full_time_home_goals = m.full_time_away_goals),
    sum((e.pred_home_goals + e.pred_away_goals)::numeric), sum(m.full_time_home_goals + m.full_time_away_goals)
  from e join common using (match_id) join public.matches m using (match_id) join mk using (match_id)
  where e.as_of_date < m.match_date::date
  group by 1, 2, 3;
$function$
;

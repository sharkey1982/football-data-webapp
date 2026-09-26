-- Live definition exported from the database (function get_model_scorecard()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_model_scorecard()
 RETURNS TABLE(league_id bigint, season_id bigint, team_type text, phase text, n bigint, ll_model numeric, ll_market numeric, brier_model numeric, brier_market numeric, p_draw numeric, m_draw numeric, draws bigint, pred_goals numeric, goals bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select s.league_id, s.season_id, s.team_type, s.phase, count(*),
    sum(-ln(case s.result when 'H' then s.p_home when 'D' then s.p_draw else s.p_away end)),
    sum(-ln(case s.result when 'H' then s.m_home when 'D' then s.m_draw else s.m_away end)),
    sum((s.p_home - (s.result = 'H')::int)^2 + (s.p_draw - (s.result = 'D')::int)^2 + (s.p_away - (s.result = 'A')::int)^2),
    sum((s.m_home - (s.result = 'H')::int)^2 + (s.m_draw - (s.result = 'D')::int)^2 + (s.m_away - (s.result = 'A')::int)^2),
    sum(s.p_draw), sum(s.m_draw), count(*) filter (where s.result = 'D'),
    sum(s.lh + s.la), sum(s.hg + s.ag)
  from public.model_scorecard_matches s
  group by 1, 2, 3, 4;
$function$
;

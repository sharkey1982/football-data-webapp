-- Live definition exported from the database (view finance_published_periods).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.finance_published_periods with (security_invoker=true) as
 SELECT p.team_id,
    p.period_start,
    p.period_end,
    p.period_months,
    p.season_id,
    p.reporting_entity,
    p.company_number,
    p.is_consolidated,
    p.currency,
    p.unit_scale,
    max(v.value) FILTER (WHERE (v.metric_key = 'revenue_total'::text)) AS revenue_total,
    max(v.value) FILTER (WHERE (v.metric_key = 'revenue_matchday'::text)) AS revenue_matchday,
    max(v.value) FILTER (WHERE (v.metric_key = 'revenue_broadcast'::text)) AS revenue_broadcast,
    max(v.value) FILTER (WHERE (v.metric_key = 'revenue_commercial'::text)) AS revenue_commercial,
    max(v.value) FILTER (WHERE (v.metric_key = 'revenue_other'::text)) AS revenue_other,
    max(v.value) FILTER (WHERE (v.metric_key = 'staff_costs'::text)) AS staff_costs,
    max(v.value) FILTER (WHERE (v.metric_key = 'player_amortisation'::text)) AS player_amortisation,
    max(v.value) FILTER (WHERE (v.metric_key = 'player_impairment'::text)) AS player_impairment,
    max(v.value) FILTER (WHERE (v.metric_key = 'profit_on_player_disposals'::text)) AS profit_on_player_disposals,
    max(v.value) FILTER (WHERE (v.metric_key = 'operating_profit'::text)) AS operating_profit,
    max(v.value) FILTER (WHERE (v.metric_key = 'profit_before_tax'::text)) AS profit_before_tax,
    max(v.value) FILTER (WHERE (v.metric_key = 'profit_after_tax'::text)) AS profit_after_tax,
    max(v.value) FILTER (WHERE (v.metric_key = 'cash'::text)) AS cash,
    max(v.value) FILTER (WHERE (v.metric_key = 'borrowings'::text)) AS borrowings,
    max(v.value) FILTER (WHERE (v.metric_key = 'total_assets'::text)) AS total_assets,
    max(v.value) FILTER (WHERE (v.metric_key = 'total_liabilities'::text)) AS total_liabilities,
    max(v.value) FILTER (WHERE (v.metric_key = 'net_assets'::text)) AS net_assets,
    max(v.value) FILTER (WHERE (v.metric_key = 'average_employees'::text)) AS average_employees,
    p.is_latest,
    p.is_comparable,
    p.filing_date,
    p.source_url,
    p.validation_status
   FROM (finance_periods p
     LEFT JOIN finance_metric_values v ON ((v.financial_id = p.financial_id)))
  GROUP BY p.financial_id;

-- Live definition exported from the database (view finance_derived_metrics).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.finance_derived_metrics with (security_invoker=true) as
 SELECT p.team_id,
    p.period_end,
    'staff_cost_ratio'::text AS metric_key,
        CASE
            WHEN ((rev.value IS NULL) OR (rev.value = (0)::numeric)) THEN NULL::numeric
            ELSE (staff.value / rev.value)
        END AS value,
    'Staff costs divided by total revenue.'::text AS definition,
    1 AS calculation_version
   FROM ((finance_periods p
     JOIN finance_metric_values staff ON (((staff.financial_id = p.financial_id) AND (staff.metric_key = 'staff_costs'::text))))
     JOIN finance_metric_values rev ON (((rev.financial_id = p.financial_id) AND (rev.metric_key = 'revenue_total'::text))));

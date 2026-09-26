-- Live definition exported from the database (view finance_published_provenance).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.finance_published_provenance with (security_invoker=true) as
 SELECT p.team_id,
    p.period_end,
    v.metric_key,
    v.original_xbrl_concept,
    v.original_value,
    v.original_unit,
    v.filing_reference,
    v.document_id,
    v.source_url,
    v.mapping_version
   FROM (finance_metric_values v
     JOIN finance_periods p ON ((p.financial_id = v.financial_id)));

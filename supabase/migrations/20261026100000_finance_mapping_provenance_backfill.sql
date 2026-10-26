-- Finance provenance backfill (2026-10-26).
--
-- Every finance_metric_values row cites (original_xbrl_concept, metric_key,
-- mapping_version), and the contract says each must resolve to a versioned
-- finance_metric_mappings row. At handover 785 of 2,156 published values
-- (36%) cited a combination with no mapping row: the initial ingestion wrote
-- per-club concept names without registering them.
--
-- This registers one mapping row per missing (source, concept, metric,
-- version), derived from the values themselves, listing the companies that
-- use it. No value, period or publication status changes. Safe to re-run.

insert into public.finance_metric_mappings
  (source, xbrl_concept, metric_key, mapping_version, context_rules, notes, is_active)
select
  f.source,
  v.original_xbrl_concept,
  v.metric_key,
  v.mapping_version,
  jsonb_build_object(
    'extraction', case when v.original_xbrl_concept like 'core:%' then 'ixbrl_or_statement_table'
                       else 'statement_table_ocr_manual_validation' end,
    'period_type', case when d.statement_type = 'balance_sheet' then 'instant' else 'duration' end,
    'company_numbers', jsonb_agg(distinct p.company_number order by p.company_number),
    'backfilled', true),
  'Backfilled 2026-10-26: registered from existing metric values that cited this concept/version '
    || 'without a mapping row. Club-specific derivations remain on each raw fact.',
  true
from public.finance_metric_values v
join public.finance_periods p using (financial_id)
join public.finance_filings f on f.filing_id = p.filing_id
join public.finance_metric_dictionary d on d.metric_key = v.metric_key
where v.original_xbrl_concept is not null
  and v.mapping_version is not null
  and not exists (
    select 1 from public.finance_metric_mappings m
    where m.source = f.source
      and m.xbrl_concept = v.original_xbrl_concept
      and m.metric_key = v.metric_key
      and m.mapping_version = v.mapping_version)
group by f.source, v.original_xbrl_concept, v.metric_key, v.mapping_version, d.statement_type
on conflict (source, xbrl_concept, metric_key, mapping_version) do nothing;

do $$
declare v_missing int;
begin
  select count(*) into v_missing
  from public.finance_metric_values v
  join public.finance_periods p using (financial_id)
  join public.finance_filings f on f.filing_id = p.filing_id
  where not exists (
    select 1 from public.finance_metric_mappings m
    where m.source = f.source and m.xbrl_concept = v.original_xbrl_concept
      and m.metric_key = v.metric_key and m.mapping_version = v.mapping_version);
  if v_missing <> 0 then
    raise exception 'finance provenance backfill: % values still unmapped', v_missing;
  end if;
end $$;

-- Publish Real Madrid (team 146) finance, FY2020-FY2025, in euros.
-- Unblocked by the currency-aware finance pages (#477): amounts show in EUR,
-- never converted, and comparisons stay GBP-only. Data re-verified against the
-- audited reports' page images and gaps filled (20261026130000); see
-- docs/finance-ingestion.md.
--
-- Guarded: publishes only if exactly the reviewed rows are present
-- (6 current periods, 102 values). Safe to re-run.
do $$
declare v_periods int; v_values int;
begin
  select count(*) into v_periods from public.finance_periods
   where team_id = 146 and is_current_version and validation_status in ('validated', 'published');
  select count(*) into v_values from public.finance_metric_values v
   join public.finance_periods p using (financial_id)
   where p.team_id = 146 and p.is_current_version and v.validation_status in ('validated', 'published');
  if v_periods <> 6 or v_values <> 102 then
    raise exception 'publish guard: % periods / % values, expected 6 / 102', v_periods, v_values;
  end if;

  update public.finance_metric_values v
     set validation_status = 'published'
    from public.finance_periods p
   where p.financial_id = v.financial_id and p.team_id = 146
     and p.is_current_version and v.validation_status = 'validated';

  update public.finance_periods
     set validation_status = 'published', published_at = now(), updated_at = now()
   where team_id = 146 and is_current_version and validation_status = 'validated';

  update public.finance_ingestion_runs
     set details = details || jsonb_build_object('publication', 'published', 'published_at', now())
   where details->>'club' = 'real-madrid';
end $$;

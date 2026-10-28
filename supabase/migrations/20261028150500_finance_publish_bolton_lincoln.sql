-- Publish the two clubs loaded privately by 20261028150000:
-- Bolton (40), Lincoln (107).
-- Every figure was confirmed against the page image
-- and every period reconciles exactly; audit table in docs/finance-ingestion.md.
--
-- Guarded: publishes only if exactly the reviewed rows are present
-- (12 current periods, 173 values, one latest period per club), so a partial
-- or changed load stops here instead of going public. Safe to re-run.
do $$
declare v_periods int; v_values int; v_latest int;
begin
  select count(*), count(*) filter (where is_latest) into v_periods, v_latest from public.finance_periods
   where team_id in (40, 107) and is_current_version and validation_status in ('validated', 'published');
  select count(*) into v_values from public.finance_metric_values v
   join public.finance_periods p using (financial_id)
   where p.team_id in (40, 107) and p.is_current_version and v.validation_status in ('validated', 'published');
  if v_periods <> 12 or v_values <> 173 or v_latest <> 2 then
    raise exception 'publish guard: % periods / % values / % latest, expected 12 / 173 / 2', v_periods, v_values, v_latest;
  end if;

  update public.finance_metric_values v
     set validation_status = 'published'
    from public.finance_periods p
   where p.financial_id = v.financial_id and p.team_id in (40, 107)
     and p.is_current_version and v.validation_status = 'validated';

  update public.finance_periods
     set validation_status = 'published', published_at = now(), updated_at = now()
   where team_id in (40, 107) and is_current_version and validation_status = 'validated';

  update public.finance_ingestion_runs
     set details = details || jsonb_build_object('stage', 'published', 'published_at', now())
   where details->>'run' = 'finance-batch-2026-10-28d';
end $$;

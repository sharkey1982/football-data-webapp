-- Publish the six Championship clubs loaded privately by 20261028100000:
-- Sheffield United (63), Middlesbrough (33), Norwich (44), West Brom (11),
-- Stoke (9), Watford (39). Every figure was confirmed against the page image
-- and every period reconciles exactly; audit table in docs/finance-ingestion.md.
--
-- Guarded: publishes only if exactly the reviewed rows are present
-- (36 current periods, 634 values, one latest period per club), so a partial
-- or changed load stops here instead of going public. Safe to re-run.
do $$
declare v_periods int; v_values int; v_latest int;
begin
  select count(*), count(*) filter (where is_latest) into v_periods, v_latest from public.finance_periods
   where team_id in (63, 33, 44, 11, 9, 39) and is_current_version and validation_status in ('validated', 'published');
  select count(*) into v_values from public.finance_metric_values v
   join public.finance_periods p using (financial_id)
   where p.team_id in (63, 33, 44, 11, 9, 39) and p.is_current_version and v.validation_status in ('validated', 'published');
  if v_periods <> 36 or v_values <> 634 or v_latest <> 6 then
    raise exception 'publish guard: % periods / % values / % latest, expected 36 / 634 / 6', v_periods, v_values, v_latest;
  end if;

  update public.finance_metric_values v
     set validation_status = 'published'
    from public.finance_periods p
   where p.financial_id = v.financial_id and p.team_id in (63, 33, 44, 11, 9, 39)
     and p.is_current_version and v.validation_status = 'validated';

  update public.finance_periods
     set validation_status = 'published', published_at = now(), updated_at = now()
   where team_id in (63, 33, 44, 11, 9, 39) and is_current_version and validation_status = 'validated';

  update public.finance_ingestion_runs
     set details = details || jsonb_build_object('stage', 'published', 'published_at', now())
   where details->>'run' = 'finance-batch-2026-10-28';
end $$;

-- Publish the seven clubs loaded privately by 20261028130000:
-- QPR (7), Charlton (24), Millwall (35), Portsmouth (82), Preston (59), Swansea (6), Wrexham (102).
-- Every figure was confirmed against the page image
-- and every period reconciles exactly; audit table in docs/finance-ingestion.md.
--
-- Guarded: publishes only if exactly the reviewed rows are present
-- (42 current periods, 671 values, one latest period per club), so a partial
-- or changed load stops here instead of going public. Safe to re-run.
do $$
declare v_periods int; v_values int; v_latest int;
begin
  select count(*), count(*) filter (where is_latest) into v_periods, v_latest from public.finance_periods
   where team_id in (7, 24, 35, 82, 59, 6, 102) and is_current_version and validation_status in ('validated', 'published');
  select count(*) into v_values from public.finance_metric_values v
   join public.finance_periods p using (financial_id)
   where p.team_id in (7, 24, 35, 82, 59, 6, 102) and p.is_current_version and v.validation_status in ('validated', 'published');
  if v_periods <> 42 or v_values <> 671 or v_latest <> 7 then
    raise exception 'publish guard: % periods / % values / % latest, expected 42 / 671 / 7', v_periods, v_values, v_latest;
  end if;

  update public.finance_metric_values v
     set validation_status = 'published'
    from public.finance_periods p
   where p.financial_id = v.financial_id and p.team_id in (7, 24, 35, 82, 59, 6, 102)
     and p.is_current_version and v.validation_status = 'validated';

  update public.finance_periods
     set validation_status = 'published', published_at = now(), updated_at = now()
   where team_id in (7, 24, 35, 82, 59, 6, 102) and is_current_version and validation_status = 'validated';

  update public.finance_ingestion_runs
     set details = details || jsonb_build_object('stage', 'published', 'published_at', now())
   where details->>'run' = 'finance-batch-2026-10-28c';
end $$;

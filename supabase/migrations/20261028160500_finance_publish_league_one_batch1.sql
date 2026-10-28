-- Publish the six clubs loaded privately by 20261028160000:
-- Leicester (3), Luton (78), Sheffield Wednesday (26), Huddersfield (29),
-- Reading (42), Plymouth (76). League One batch 1.
-- Scanned figures were confirmed against the page image; iXBRL years read from
-- the tagged text. Every period reconciles exactly except Reading FY2025, whose
-- printed turnover categories sum to £1 under turnover (kept as printed).
-- Audit table in docs/finance-ingestion.md.
--
-- Guarded: publishes only if exactly the reviewed rows are present
-- (35 current periods, 560 values, one latest period per club), so a partial
-- or changed load stops here instead of going public. Safe to re-run.
do $$
declare v_periods int; v_values int; v_latest int;
begin
  select count(*), count(*) filter (where is_latest) into v_periods, v_latest from public.finance_periods
   where team_id in (3, 78, 26, 29, 42, 76) and is_current_version and validation_status in ('validated', 'published');
  select count(*) into v_values from public.finance_metric_values v
   join public.finance_periods p using (financial_id)
   where p.team_id in (3, 78, 26, 29, 42, 76) and p.is_current_version and v.validation_status in ('validated', 'published');
  if v_periods <> 35 or v_values <> 560 or v_latest <> 6 then
    raise exception 'publish guard: % periods / % values / % latest, expected 35 / 560 / 6', v_periods, v_values, v_latest;
  end if;

  update public.finance_metric_values v
     set validation_status = 'published'
    from public.finance_periods p
   where p.financial_id = v.financial_id and p.team_id in (3, 78, 26, 29, 42, 76)
     and p.is_current_version and v.validation_status = 'validated';

  update public.finance_periods
     set validation_status = 'published', published_at = now(), updated_at = now()
   where team_id in (3, 78, 26, 29, 42, 76) and is_current_version and validation_status = 'validated';

  update public.finance_ingestion_runs
     set details = details || jsonb_build_object('stage', 'published', 'published_at', now())
   where details->>'run' = 'finance-batch-2026-10-28e';
end $$;

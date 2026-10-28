-- Publish the three clubs loaded privately by 20261028180000:
-- Oxford (87), Rotherham (28), Wycombe (84): with these, every club in the
-- Championship or Premier League since 2020/21 is covered.
-- Scanned figures were confirmed against the page image; iXBRL years read from
-- the tagged text. Every period reconciles exactly. Wycombe files filleted
-- small-company accounts (no income statement in any year).
-- Audit table in docs/finance-ingestion.md.
--
-- Guarded: publishes only if exactly the reviewed rows are present
-- (18 current periods, 207 values, one latest period per club), so a partial
-- or changed load stops here instead of going public. Safe to re-run.
do $$
declare v_periods int; v_values int; v_latest int;
begin
  select count(*), count(*) filter (where is_latest) into v_periods, v_latest from public.finance_periods
   where team_id in (87, 28, 84) and is_current_version and validation_status in ('validated', 'published');
  select count(*) into v_values from public.finance_metric_values v
   join public.finance_periods p using (financial_id)
   where p.team_id in (87, 28, 84) and p.is_current_version and v.validation_status in ('validated', 'published');
  if v_periods <> 18 or v_values <> 207 or v_latest <> 3 then
    raise exception 'publish guard: % periods / % values / % latest, expected 18 / 207 / 3', v_periods, v_values, v_latest;
  end if;

  update public.finance_metric_values v
     set validation_status = 'published'
    from public.finance_periods p
   where p.financial_id = v.financial_id and p.team_id in (87, 28, 84)
     and p.is_current_version and v.validation_status = 'validated';

  update public.finance_periods
     set validation_status = 'published', published_at = now(), updated_at = now()
   where team_id in (87, 28, 84) and is_current_version and validation_status = 'validated';

  update public.finance_ingestion_runs
     set details = details || jsonb_build_object('stage', 'published', 'published_at', now())
   where details->>'run' = 'finance-batch-2026-10-28g';
end $$;

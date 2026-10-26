-- Publish the reviewed Wolves (43), Burnley (19) and Southampton (16) finance
-- periods loaded privately by 20261026110000. Review: every figure confirmed
-- against the page image; all periods reconcile exactly; production rows
-- checked after the private load (18 periods, 302 values, one latest per
-- team, every value mapped). Audit table: docs/finance-ingestion.md.
--
-- Guarded: publishes only if exactly the reviewed rows are present, so a
-- changed or partial load stops here instead of going public. Safe to re-run.
do $$
declare v_periods int; v_values int;
begin
  select count(*) into v_periods from public.finance_periods
   where team_id in (16, 19, 43) and is_current_version and validation_status in ('validated', 'published');
  select count(*) into v_values from public.finance_metric_values v
   join public.finance_periods p using (financial_id)
   where p.team_id in (16, 19, 43) and p.is_current_version and v.validation_status in ('validated', 'published');
  if v_periods <> 18 or v_values <> 302 then
    raise exception 'publish guard: % periods / % values, expected 18 / 302', v_periods, v_values;
  end if;

  update public.finance_metric_values v
     set validation_status = 'published'
    from public.finance_periods p
   where p.financial_id = v.financial_id and p.team_id in (16, 19, 43)
     and p.is_current_version and v.validation_status = 'validated';

  update public.finance_periods
     set validation_status = 'published', published_at = now(), updated_at = now()
   where team_id in (16, 19, 43) and is_current_version and validation_status = 'validated';

  update public.finance_ingestion_runs
     set details = details || jsonb_build_object('stage', 'published', 'published_at', now())
   where details->>'run' = 'finance-batch-2026-10-26';
end $$;

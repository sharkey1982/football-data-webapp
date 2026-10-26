-- Real Madrid (team 146): fill metrics the audited reports disclose exactly,
-- after re-verifying all 72 loaded values against the page images (0 mismatches).
-- Source PDFs fetched by finance-fetch.yml; SHA-256 identical to the loaded filings.
-- Borrowings include the Bernabeu remodelling loans (interest-bearing, fixed rate,
-- carried in 'Other financial liabilities') plus bank borrowings; leases, transfer
-- creditors and trade payables excluded. Player impairment stored as a CHARGE
-- (positive), so net reversals (FY2020, FY2021, FY2023) are negative.
-- Private: values are 'validated'; publication is a separate migration.
-- Safe to re-run: each value is skipped if that period already has the metric.

insert into public.finance_metric_mappings (source, xbrl_concept, metric_key, mapping_version, context_rules, notes, is_active) values
  ('club_annual_report', 'pdf:RealMadrid_average_employees', 'average_employees', 3, '{"extraction": "statement_table_ocr_page_image_validation", "period_type": "duration", "company_numbers": ["G-28034718"], "document_format": "PDF"}'::jsonb, 'Real Madrid audited report mapping v3; components and pages retained on each raw fact.', true),
  ('club_annual_report', 'pdf:RealMadrid_borrowings', 'borrowings', 3, '{"extraction": "statement_table_ocr_page_image_validation", "period_type": "instant", "company_numbers": ["G-28034718"], "document_format": "PDF"}'::jsonb, 'Real Madrid audited report mapping v3; components and pages retained on each raw fact.', true),
  ('club_annual_report', 'pdf:RealMadrid_player_amortisation', 'player_amortisation', 3, '{"extraction": "statement_table_ocr_page_image_validation", "period_type": "duration", "company_numbers": ["G-28034718"], "document_format": "PDF"}'::jsonb, 'Real Madrid audited report mapping v3; components and pages retained on each raw fact.', true),
  ('club_annual_report', 'pdf:RealMadrid_player_impairment', 'player_impairment', 3, '{"extraction": "statement_table_ocr_page_image_validation", "period_type": "duration", "company_numbers": ["G-28034718"], "document_format": "PDF"}'::jsonb, 'Real Madrid audited report mapping v3; components and pages retained on each raw fact.', true),
  ('club_annual_report', 'pdf:RealMadrid_profit_on_player_disposals', 'profit_on_player_disposals', 3, '{"extraction": "statement_table_ocr_page_image_validation", "period_type": "duration", "company_numbers": ["G-28034718"], "document_format": "PDF"}'::jsonb, 'Real Madrid audited report mapping v3; components and pages retained on each raw fact.', true)
on conflict (source, xbrl_concept, metric_key, mapping_version) do nothing;

do $$
declare v_fin bigint; v_filing bigint; v_ps date; v_raw bigint; v_n int := 0;
begin
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2020-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2020-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'borrowings') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_borrowings', 'official_current', null, null, '2020-06-30', '304,941', 304941000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "borrowings", "scope": "Club only", "label": "Bank borrowings (non-current + current) + stadium remodelling loan carried in ''Other financial liabilities'' sub-line", "page": 18, "derivation": "bank borrowings non-current 152,649 + bank borrowings current 52,292 + stadium loan 100,000 = 304,941 (EUR k). Pages: 14.1 p46, 14.2 p47, 14 p45, BS p18. Excludes suppliers of fixed assets, sports entities for player transfers, non-current payables (sports-personnel bonuses), trade payables. Undrawn credit facilities not included.", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_18')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'borrowings', 304941000, 'EUR', 1, v_raw, 'pdf:RealMadrid_borrowings', '304,941', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2021-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2021-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'borrowings') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_borrowings', 'official_current', null, null, '2021-06-30', '529,975', 529975000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "borrowings", "scope": "Club only", "label": "Bank borrowings (non-current + current) + stadium remodelling loan carried in ''Other financial liabilities'' sub-line", "page": 19, "derivation": "bank borrowings non-current 152,676 + bank borrowings current 2,299 + stadium loan 375,000 = 529,975 (EUR k). Pages: 14.1 p47, 14.2 p48, BS p19. Excludes suppliers of fixed assets, sports entities for player transfers, non-current payables (sports-personnel bonuses), trade payables. Undrawn credit facilities not included.", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_19')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'borrowings', 529975000, 'EUR', 1, v_raw, 'pdf:RealMadrid_borrowings', '529,975', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2022-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2022-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'borrowings') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_borrowings', 'official_current', null, null, '2022-06-30', '953,428', 953428000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "borrowings", "scope": "Consolidated group", "label": "Bank borrowings (non-current + current) + stadium remodelling loan carried in ''Other financial liabilities'' sub-line", "page": 20, "derivation": "bank borrowings non-current 114,789 + bank borrowings current 38,356 + stadium loan 800,283 = 953,428 (EUR k). Pages: 14.1 p53, 14.2 p54, BS p20. Excludes suppliers of fixed assets, sports entities for player transfers, non-current payables (sports-personnel bonuses), trade payables. Undrawn credit facilities not included.", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_20')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'borrowings', 953428000, 'EUR', 1, v_raw, 'pdf:RealMadrid_borrowings', '953,428', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2023-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2023-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'borrowings') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_borrowings', 'official_current', null, null, '2023-06-30', '932,205', 932205000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "borrowings", "scope": "Consolidated group", "label": "Bank borrowings (non-current + current) + stadium remodelling loan carried in ''Other financial liabilities'' sub-line", "page": 20, "derivation": "bank borrowings non-current 76,573 + bank borrowings current 38,509 + stadium loan 784,768 + stadium loan 32,355 = 932,205 (EUR k). Pages: 14.1 p51, 14.2 p52, 19.3 p71, BS p20. Excludes suppliers of fixed assets, sports entities for player transfers, non-current payables (sports-personnel bonuses), trade payables. Undrawn credit facilities not included.", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_20')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'borrowings', 932205000, 'EUR', 1, v_raw, 'pdf:RealMadrid_borrowings', '932,205', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2024-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2024-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'borrowings') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_borrowings', 'official_current', null, null, '2024-06-30', '1,260,061', 1260061000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "borrowings", "scope": "Consolidated group", "label": "Bank borrowings (non-current + current) + stadium remodelling loan carried in ''Other financial liabilities'' sub-line", "page": 22, "derivation": "bank borrowings non-current 37,644 + bank borrowings current 39,390 + stadium loan 1,131,872 + stadium loan 51,155 = 1,260,061 (EUR k). Pages: 14.1 p53, 14.3 p54, 19.3 p73, 6.1 p42, BS p22. Excludes suppliers of fixed assets, sports entities for player transfers, non-current payables (sports-personnel bonuses), trade payables. Undrawn credit facilities not included.", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_22')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'borrowings', 1260061000, 'EUR', 1, v_raw, 'pdf:RealMadrid_borrowings', '1,260,061', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2025-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2025-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'borrowings') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_borrowings', 'official_current', null, null, '2025-06-30', '1,301,410', 1301410000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "borrowings", "scope": "Consolidated group", "label": "Bank borrowings (non-current + current) + stadium remodelling loan carried in ''Other financial liabilities'' sub-line", "page": 22, "derivation": "bank borrowings non-current 74,904 + bank borrowings current 66,110 + stadium loan 1,109,239 + stadium loan 51,157 = 1,301,410 (EUR k). Pages: 14.1 p54, 14.3 p55, 19.3 p76, 6.1 p42, BS p22. Excludes suppliers of fixed assets, sports entities for player transfers, non-current payables (sports-personnel bonuses), trade payables. Undrawn credit facilities not included.", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_22')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'borrowings', 1301410000, 'EUR', 1, v_raw, 'pdf:RealMadrid_borrowings', '1,301,410', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2020-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2020-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'average_employees') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_average_employees', 'official_current', v_ps, '2020-06-30', null, '797', 797, 'persons', null, 1, '{"metric_key": "average_employees", "scope": "Club only", "label": "Average number of employees in the period (total), note 20.1 ''Club employees by category'' - club scope", "page": 65, "derivation": null, "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_65')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'average_employees', 797, null, 1, v_raw, 'pdf:RealMadrid_average_employees', '797', 'persons', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2021-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2021-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'average_employees') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_average_employees', 'official_current', v_ps, '2021-06-30', null, '819', 819, 'persons', null, 1, '{"metric_key": "average_employees", "scope": "Club only", "label": "Average number of employees in the period (total), note 20.1 - club scope", "page": 66, "derivation": null, "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_66')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'average_employees', 819, null, 1, v_raw, 'pdf:RealMadrid_average_employees', '819', 'persons', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2022-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2022-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'average_employees') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_average_employees', 'official_current', v_ps, '2022-06-30', null, '894', 894, 'persons', null, 1, '{"metric_key": "average_employees", "scope": "Consolidated group", "label": "Average number of employees in the period (total), note 20.1 in consolidated notes (table headed ''Club employees by category'')", "page": 74, "derivation": "Printed in the consolidated notes under the heading ''Club employees by category'' (from FY2024 ''Group headcount'').", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_74')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'average_employees', 894, null, 1, v_raw, 'pdf:RealMadrid_average_employees', '894', 'persons', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2023-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2023-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'average_employees') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_average_employees', 'official_current', v_ps, '2023-06-30', null, '974', 974, 'persons', null, 1, '{"metric_key": "average_employees", "scope": "Consolidated group", "label": "Average number of employees in the period (total), note 20.1 in consolidated notes (headed ''Club employees by category''); total row printed 974, rows sum 50+36+473+352+41+22=974", "page": 72, "derivation": "Printed in the consolidated notes under the heading ''Club employees by category'' (from FY2024 ''Group headcount'').", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_72')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'average_employees', 974, null, 1, v_raw, 'pdf:RealMadrid_average_employees', '974', 'persons', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2024-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2024-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'average_employees') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_average_employees', 'official_current', v_ps, '2024-06-30', null, '1118', 1118, 'persons', null, 1, '{"metric_key": "average_employees", "scope": "Consolidated group", "label": "Average number of employees in the year (total), note 20.1 ''Group headcount by employee category''", "page": 74, "derivation": null, "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_74')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'average_employees', 1118, null, 1, v_raw, 'pdf:RealMadrid_average_employees', '1118', 'persons', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2025-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2025-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'average_employees') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_average_employees', 'official_current', v_ps, '2025-06-30', null, '1191', 1191, 'persons', null, 1, '{"metric_key": "average_employees", "scope": "Consolidated group", "label": "Average number of employees in the year (total), note 20.1 ''Group headcount by employee category''", "page": 77, "derivation": null, "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_77')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'average_employees', 1191, null, 1, v_raw, 'pdf:RealMadrid_average_employees', '1191', 'persons', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2020-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2020-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'player_amortisation') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_player_amortisation', 'official_current', v_ps, '2020-06-30', null, '159,188', 159188000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "player_amortisation", "scope": "Club only", "label": "Note 4 sports intangible assets: Accumulated amortization, ''Additions and allowances'' column (player registration rights only)", "page": 31, "derivation": "Football 158,865 + Basketball 323 = 159,188 (EUR k), stored as a positive charge", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_31')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'player_amortisation', 159188000, 'EUR', 1, v_raw, 'pdf:RealMadrid_player_amortisation', '159,188', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2021-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2021-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'player_amortisation') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_player_amortisation', 'official_current', v_ps, '2021-06-30', null, '158,463', 158463000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "player_amortisation", "scope": "Club only", "label": "Note 4 sports intangible assets: Accumulated amortization, ''Additions and allowances'' column (player registration rights only)", "page": 32, "derivation": "Football 158,173 + Basketball 290 = 158,463 (EUR k), stored as a positive charge", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_32')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'player_amortisation', 158463000, 'EUR', 1, v_raw, 'pdf:RealMadrid_player_amortisation', '158,463', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2022-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2022-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'player_amortisation') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_player_amortisation', 'official_current', v_ps, '2022-06-30', null, '163,762', 163762000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "player_amortisation", "scope": "Consolidated group", "label": "Note 4 sports intangible assets: Accumulated amortization, ''Additions and allowances'' column (player registration rights only)", "page": 38, "derivation": "Football 163,655 + Basketball 107 = 163,762 (EUR k), stored as a positive charge", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_38')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'player_amortisation', 163762000, 'EUR', 1, v_raw, 'pdf:RealMadrid_player_amortisation', '163,762', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2023-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2023-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'player_amortisation') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_player_amortisation', 'official_current', v_ps, '2023-06-30', null, '138,925', 138925000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "player_amortisation", "scope": "Consolidated group", "label": "Note 4 sports intangible assets: Accumulated amortization, ''Additions and allowances'' column (player registration rights only)", "page": 36, "derivation": "Men''s football 138,744 + Women''s football 102 + Basketball 79 = 138,925 (EUR k), stored as a positive charge", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_36')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'player_amortisation', 138925000, 'EUR', 1, v_raw, 'pdf:RealMadrid_player_amortisation', '138,925', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2024-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2024-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'player_amortisation') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_player_amortisation', 'official_current', v_ps, '2024-06-30', null, '117,427', 117427000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "player_amortisation", "scope": "Consolidated group", "label": "Note 4 sports intangible assets: Accumulated amortization, ''Additions and allowances'' column (player registration rights only)", "page": 38, "derivation": "Men''s football 117,258 + Women''s football 109 + Basketball 60 = 117,427 (EUR k), stored as a positive charge", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_38')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'player_amortisation', 117427000, 'EUR', 1, v_raw, 'pdf:RealMadrid_player_amortisation', '117,427', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2025-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2025-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'player_amortisation') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_player_amortisation', 'official_current', v_ps, '2025-06-30', null, '115,841', 115841000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "player_amortisation", "scope": "Consolidated group", "label": "Note 4 sports intangible assets: Accumulated amortization, ''Additions and allowances'' column (player registration rights only)", "page": 38, "derivation": "Men''s football 115,564 + Women''s football 82 + Basketball 195 = 115,841 (EUR k), stored as a positive charge", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_38')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'player_amortisation', 115841000, 'EUR', 1, v_raw, 'pdf:RealMadrid_player_amortisation', '115,841', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2020-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2020-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'player_impairment') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_player_impairment', 'official_current', v_ps, '2020-06-30', null, '26,025', -26025000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "player_impairment", "scope": "Club only", "label": "Impairment and losses on sports intangible assets (Notes 4.1 and 4.2)", "page": 60, "derivation": "Stored as a charge (positive) / net reversal (negative); report prints 26,025 with negative = charge. Sign as printed in note 17.5 (P&L effect): negative = impairment charge, positive = net reversal. net REVERSAL: reversal 42,501 less new impairment 16,476 (note 4.1/4.2 p32) = 26,025", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_60')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'player_impairment', -26025000, 'EUR', 1, v_raw, 'pdf:RealMadrid_player_impairment', '26,025', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2021-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2021-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'player_impairment') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_player_impairment', 'official_current', v_ps, '2021-06-30', null, '16,476', -16476000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "player_impairment", "scope": "Club only", "label": "Impairment and losses on sports intangible assets (Notes 4.1 and 4.2)", "page": 61, "derivation": "Stored as a charge (positive) / net reversal (negative); report prints 16,476 with negative = charge. Sign as printed in note 17.5 (P&L effect): negative = impairment charge, positive = net reversal. net REVERSAL of 16,476 prior-year impairment (note 4.2 p33); no new impairment", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_61')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'player_impairment', -16476000, 'EUR', 1, v_raw, 'pdf:RealMadrid_player_impairment', '16,476', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2022-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2022-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'player_impairment') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_player_impairment', 'official_current', v_ps, '2022-06-30', null, '(60,874)', 60874000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "player_impairment", "scope": "Consolidated group", "label": "Change in impairment and losses on sports intangible assets (Notes 4.1 and 4.2)", "page": 69, "derivation": "Stored as a charge (positive) / net reversal (negative); report prints (60,874) with negative = charge. Sign as printed in note 17.5 (P&L effect): negative = impairment charge, positive = net reversal. charge 60,874 (note 4 p38)", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_69')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'player_impairment', 60874000, 'EUR', 1, v_raw, 'pdf:RealMadrid_player_impairment', '(60,874)', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2023-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2023-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'player_impairment') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_player_impairment', 'official_current', v_ps, '2023-06-30', null, '2,849', -2849000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "player_impairment", "scope": "Consolidated group", "label": "Change in impairment and other gains/(losses) on sports intangible assets (Notes 4.1 and 4.2)", "page": 67, "derivation": "Stored as a charge (positive) / net reversal (negative); report prints 2,849 with negative = charge. Sign as printed in note 17.5 (P&L effect): negative = impairment charge, positive = net reversal. net reversal: 14,148 reversal less 11,299 new impairment (note 4 p36-37). Excludes separate line ''Disposals of sports intangible assets'' (33,456), which is a derecognition loss already netted in note 4.3 disposal result", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_67')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'player_impairment', -2849000, 'EUR', 1, v_raw, 'pdf:RealMadrid_player_impairment', '2,849', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2024-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2024-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'player_impairment') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_player_impairment', 'official_current', v_ps, '2024-06-30', null, '(8,249)', 8249000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "player_impairment", "scope": "Consolidated group", "label": "Change in impairment and other gains/(losses) on sports intangible assets (Notes 4.1 and 4.2)", "page": 69, "derivation": "Stored as a charge (positive) / net reversal (negative); report prints (8,249) with negative = charge. Sign as printed in note 17.5 (P&L effect): negative = impairment charge, positive = net reversal. charge 8,249 (note 4 p38). Excludes ''Disposals of sports intangible assets'' (6,835)", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_69')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'player_impairment', 8249000, 'EUR', 1, v_raw, 'pdf:RealMadrid_player_impairment', '(8,249)', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2025-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2025-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'player_impairment') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_player_impairment', 'official_current', v_ps, '2025-06-30', null, '-', 0, 'EUR thousands', 'EUR', 1000, '{"metric_key": "player_impairment", "scope": "Consolidated group", "label": "Change in impairment of and other gains/(losses) on sports intangible assets (Notes 4.1)", "page": 72, "derivation": "Stored as a charge (positive) / net reversal (negative); report prints - with negative = charge. Sign as printed in note 17.5 (P&L effect): negative = impairment charge, positive = net reversal. printed ''-''; note 4.1 p38: ''As at the reporting date, there were no circumstances resulting in a further impairment.'' Disclosed zero. Excludes ''Disposals of sports intangible assets'' (550)", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_72')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'player_impairment', 0, 'EUR', 1, v_raw, 'pdf:RealMadrid_player_impairment', '-', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2020-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2020-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'profit_on_player_disposals') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_profit_on_player_disposals', 'official_current', v_ps, '2020-06-30', null, '101,210', 101210000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "profit_on_player_disposals", "scope": "Club only", "label": "Note 4.3: ''The net gain from all disposals after deducting the carrying amount''", "page": 32, "derivation": "equals note 17.5 ''Gains on disposal of sports intangible assets'' 101,210 (p60)", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_32')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'profit_on_player_disposals', 101210000, 'EUR', 1, v_raw, 'pdf:RealMadrid_profit_on_player_disposals', '101,210', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2021-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2021-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'profit_on_player_disposals') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_profit_on_player_disposals', 'official_current', v_ps, '2021-06-30', null, '105,549', 105549000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "profit_on_player_disposals", "scope": "Club only", "label": "Note 4.3: ''The net gain from all disposals after deducting the carrying amount''", "page": 33, "derivation": "equals note 17.5 ''Gains on disposal of sports intangible assets'' 105,549 (p61)", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_33')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'profit_on_player_disposals', 105549000, 'EUR', 1, v_raw, 'pdf:RealMadrid_profit_on_player_disposals', '105,549', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2022-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2022-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'profit_on_player_disposals') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_profit_on_player_disposals', 'official_current', v_ps, '2022-06-30', null, '62,383', 62383000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "profit_on_player_disposals", "scope": "Consolidated group", "label": "Note 4.3: ''The net gain from all disposals after deducting the carrying amount''", "page": 39, "derivation": "equals note 17.5 ''Gains/(losses) on disposal of sports intangible assets'' 62,383 (p69); excludes 316,347 ''Gains on transfer of rights'' (Sixth Street/Legends)", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_39')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'profit_on_player_disposals', 62383000, 'EUR', 1, v_raw, 'pdf:RealMadrid_profit_on_player_disposals', '62,383', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2023-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2023-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'profit_on_player_disposals') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_profit_on_player_disposals', 'official_current', v_ps, '2023-06-30', null, '55,634', 55634000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "profit_on_player_disposals", "scope": "Consolidated group", "label": "Note 4.3: ''The net gain from all disposals after deducting the carrying amount''", "page": 37, "derivation": "note 17.5 (p67) shows ''Gains/(losses) on disposal of sports intangible assets'' 104,041 = net player-transfer gains 89,090 + 14,951 release of tax provisions; 89,090 less ''Disposals of sports intangible assets'' (33,456) = 55,634 = note 4.3 figure", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_37')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'profit_on_player_disposals', 55634000, 'EUR', 1, v_raw, 'pdf:RealMadrid_profit_on_player_disposals', '55,634', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2024-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2024-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'profit_on_player_disposals') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_profit_on_player_disposals', 'official_current', v_ps, '2024-06-30', null, '20,957', 20957000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "profit_on_player_disposals", "scope": "Consolidated group", "label": "Note 4.3: ''The net gain from all disposals after deducting the carrying amount''", "page": 39, "derivation": "note 17.5 (p69) gains 27,792 less ''Disposals of sports intangible assets'' (6,835) = 20,957", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_39')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'profit_on_player_disposals', 20957000, 'EUR', 1, v_raw, 'pdf:RealMadrid_profit_on_player_disposals', '20,957', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select p.financial_id, p.filing_id, p.period_start into v_fin, v_filing, v_ps from public.finance_periods p where p.team_id = 146 and p.period_end = '2025-06-30' and p.is_current_version;
  if v_fin is null then raise exception 'Real Madrid period 2025-06-30 missing'; end if;
  if not exists (select 1 from public.finance_metric_values where financial_id = v_fin and metric_key = 'profit_on_player_disposals') then
    insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start, period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale, dimensions, source_locator)
    values (v_filing, 'pdf:RealMadrid_profit_on_player_disposals', 'official_current', v_ps, '2025-06-30', null, '32,012', 32012000, 'EUR thousands', 'EUR', 1000, '{"metric_key": "profit_on_player_disposals", "scope": "Consolidated group", "label": "Note 4.3: ''The net gain from all disposals after deducting the carrying amount''", "page": 39, "derivation": "note 17.5 (p72) gains 32,562 less ''Disposals of sports intangible assets'' (550) = 32,012", "extraction": "OCR page discovery; value confirmed against page image"}'::jsonb, 'annual_report:page_39')
    returning raw_fact_id into v_raw;
    insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale, raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id, source_url, mapping_version, validation_status, validation_notes)
    select v_fin, 'profit_on_player_disposals', 32012000, 'EUR', 1, v_raw, 'pdf:RealMadrid_profit_on_player_disposals', '32,012', 'EUR thousands', m.filing_reference, m.document_id, m.source_url, 3, 'validated', 'Confirmed against the page image (re-verification 2026-10-26).'
      from public.finance_metric_values m where m.financial_id = v_fin and m.metric_key = 'revenue_total';
    v_n := v_n + 1;
  end if;
  select count(*) into v_n from public.finance_metric_values v join public.finance_periods p using (financial_id) where p.team_id = 146;
  if v_n <> 102 then raise exception 'Real Madrid: % values, expected 102', v_n; end if;
end $$;

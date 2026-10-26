#!/usr/bin/env python3
"""Build a PRIVATE finance load migration from a reviewed PDF extraction.

Input: a batch config JSON (see --help example) pointing at, per club,
  - the extraction JSON (periods -> metrics with value/original/page/derivation),
  - the fetch manifest from finance-fetch.yml (source URL, SHA-256, dates),
  - team_id + slug (asserted against public.teams in the migration),
  - per-period comparability decisions with a plain-English reason.

Output: one SQL file. Each club is a DO block that
  - refuses to run if the team already has finance periods (safe to re-run:
    the second run is a no-op with a NOTICE),
  - asserts the team slug, period count and metric count it loads,
  - writes entity -> ingestion run -> filings -> periods -> raw facts ->
    metric values, all with validation_status 'validated' (NOT published),
  - keeps exactly one is_latest period (the newest).
Mapping rows (version MAPPING_VERSION) are inserted ON CONFLICT DO NOTHING so
every metric value resolves to a finance_metric_mappings row.

Publication is a separate, later migration; nothing here is public.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

MAPPING_VERSION = 3
CONCEPTS = {
    "revenue_total": "pdf:Turnover",
    "revenue_matchday": "pdf:MatchdayRevenue",
    "revenue_broadcast": "pdf:BroadcastingRevenue",
    "revenue_commercial": "pdf:CommercialRevenue",
    "revenue_other": "pdf:OtherRevenue",
    "staff_costs": "pdf:StaffCosts",
    "player_amortisation": "pdf:AmortisationPlayerRegistrations",
    "player_impairment": "pdf:ImpairmentPlayerRegistrations",
    "profit_on_player_disposals": "pdf:ProfitDisposalPlayerRegistrations",
    "operating_profit": "pdf:OperatingProfitLoss",
    "profit_before_tax": "pdf:ProfitLossBeforeTax",
    "profit_after_tax": "pdf:ProfitLossAfterTax",
    "cash": "pdf:CashBankOnHand",
    "borrowings": "pdf:InterestBearingBorrowingsAggregate",
    "total_assets": "pdf:TotalAssetsAggregate",
    "total_liabilities": "pdf:TotalLiabilitiesAggregate",
    "net_assets": "pdf:NetAssets",
    "average_employees": "pdf:AverageEmployees",
}
INSTANT = {"cash", "borrowings", "total_assets", "total_liabilities", "net_assets"}
CH = "https://find-and-update.company-information.service.gov.uk"


def q(v) -> str:
    """SQL literal."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def qj(v) -> str:
    return q(json.dumps(v, ensure_ascii=False, sort_keys=True)) + "::jsonb"


def season_id(period_end: str, seasons: dict) -> int:
    # Football season ending in the calendar year the accounting period ends
    # (same rule as every published club: financial_year_end_to_domestic_season).
    return seasons[period_end[:4]]


def club_block(club: dict, seasons: dict, run_label: str) -> tuple[str, list[str]]:
    ext = json.loads(Path(club["extraction"]).read_text())
    man = {m["transaction_id"]: m for m in json.loads(Path(club["manifest"]).read_text())}
    decisions = club["periods"]  # made_up_to -> {"is_comparable": bool, "reason": str}
    periods = sorted(ext["periods"], key=lambda p: p["made_up_to"])
    want = sorted(decisions)
    got = [p["made_up_to"] for p in periods]
    assert got == want, f"{club['slug']}: extraction periods {got} != decisions {want}"
    company = ext["company_number"]
    entity = club.get("entity_name") or ext["entity_name"]
    latest = periods[-1]["made_up_to"]
    n_metrics = sum(1 for p in periods for m in p["metrics"].values() if m.get("value") is not None)
    used: set[str] = set()
    lines = [
        f"-- {club['slug']} (team {club['team_id']}, company {company}): "
        f"{len(periods)} periods, {n_metrics} metric values, validated, NOT published",
        "do $$",
        "declare v_entity bigint; v_run bigint; v_filing bigint; v_fin bigint; v_raw bigint; v_n int;",
        "begin",
        f"  if not exists (select 1 from public.teams where team_id = {club['team_id']} and slug = {q(club['slug'])}) then",
        f"    raise exception 'team {club['team_id']} is not slug {club['slug']}';",
        "  end if;",
        f"  if exists (select 1 from public.finance_periods where team_id = {club['team_id']}) then",
        f"    raise notice '{club['slug']}: finance periods already exist, skipped'; return;",
        "  end if;",
        "  insert into public.finance_reporting_entities"
        " (team_id, company_number, reporting_entity, relationship_type, is_preferred, source_url)",
        f"  values ({club['team_id']}, {q(company)}, {q(entity)}, 'football_club', true, {q(f'{CH}/company/{company}')})",
        "  on conflict (team_id, company_number) do update set reporting_entity = excluded.reporting_entity",
        "  returning reporting_entity_id into v_entity;",
        "  insert into public.finance_ingestion_runs"
        " (source, started_at, completed_at, status, filings_discovered, filings_processed,"
        " facts_extracted, facts_mapped, error_count, details)",
        f"  values ('companies_house', now(), now(), 'succeeded', {len(periods)}, {len(periods)},"
        f" {n_metrics}, {n_metrics}, 0, {qj(club['run_details'] | {'stage': 'validated_private', 'run': run_label, 'team_id': club['team_id'], 'club': club['slug']})})",
        "  returning ingestion_run_id into v_run;",
    ]
    for p in periods:
        tx = p["transaction_id"]
        mf = man[tx]
        pdf = next(f for f in mf["files"] if f["format"] == "pdf")
        url = f"{CH}/company/{company}/filing-history/{tx}/document"
        dec = decisions[p["made_up_to"]]
        consolidated = p["scope"] == "group"
        notes = (f"Official image PDF; OCR page discovery, every figure confirmed against the page image, "
                 f"statement subtotal and next-filing comparative checks. Units printed {p['units_printed']}."
                 + ("" if dec["is_comparable"] else f" Not comparable: {dec['reason']}"))
        lines += [
            f"  -- {p['made_up_to']} ({p['period_months']} months, {p['scope']})",
            "  insert into public.finance_filings (reporting_entity_id, ingestion_run_id, source, filing_reference,"
            " document_id, source_url, filing_date, period_start, period_end, period_months, is_consolidated,"
            " document_format, document_sha256, retrieved_at, extraction_status, validation_status,"
            " retrieval_method, retrieval_notes, raw_fact_count)",
            f"  values (v_entity, v_run, 'companies_house', {q('AA-' + mf['filed_date'])}, {q(tx)}, {q(url)},"
            f" {q(mf['filed_date'])}, {q(p['period_start'])}, {q(p['made_up_to'])}, {p['period_months']},"
            f" {q(consolidated)}, 'application/pdf', {q(pdf['sha256'])}, {q(pdf['retrieved_at'])},"
            f" 'validated', 'validated', 'companies_house_document_download', {q(notes)},"
            f" {sum(1 for m in p['metrics'].values() if m.get('value') is not None)})",
            "  returning filing_id into v_filing;",
            "  insert into public.finance_periods (team_id, filing_id, season_id, period_start, period_end,"
            " period_months, reporting_entity, company_number, is_consolidated, currency, unit_scale,"
            " season_mapping_method, season_mapping_confidence, is_latest, is_current_version, is_comparable,"
            " filing_date, source_url, validation_status)",
            f"  values ({club['team_id']}, v_filing, {season_id(p['made_up_to'], seasons)}, {q(p['period_start'])},"
            f" {q(p['made_up_to'])}, {p['period_months']}, {q(entity)}, {q(company)}, {q(consolidated)}, 'GBP', 1,"
            f" 'financial_year_end_to_domestic_season', {q('high' if p['period_months'] == 12 else 'medium')},"
            f" {q(p['made_up_to'] == latest)}, true, {q(dec['is_comparable'])}, {q(mf['filed_date'])}, {q(url)},"
            " 'validated')",
            "  returning financial_id into v_fin;",
        ]
        for key in CONCEPTS:
            m = p["metrics"].get(key)
            if not m or m.get("value") is None:
                continue
            concept = CONCEPTS[key]
            used.add(key)
            # A figure built from several printed lines keeps its derivation as
            # the original (as published clubs do: "26,548 + 43,924").
            original = m.get("original_value") or m.get("derivation")
            assert original, f"{club['slug']} {p['made_up_to']} {key}: no original value or derivation"
            unit, ccy = ("persons", None) if key == "average_employees" else ("GBP", "GBP")
            instant = key in INSTANT
            dims = {
                "metric_key": key, "source_format": "PDF",
                "reporting_scope": "Group" if consolidated else "Company",
                "extraction": "OCR page discovery; value confirmed against page image",
                "original_label": m.get("original_label"), "units_printed": p["units_printed"],
                "derivation": m.get("derivation"), "page": m.get("page"),
            }
            unit_note = "Validated against the page image; " + (
                f"derivation: {m['derivation']}" if m.get("derivation") else "single disclosed line")
            lines += [
                "  insert into public.finance_raw_facts (filing_id, xbrl_concept, context_ref, period_start,"
                " period_end, instant_date, original_value, numeric_value, original_unit, currency, unit_scale,"
                " dimensions, source_locator)",
                f"  values (v_filing, {q(concept)}, {q('pdf_' + p['scope'] + '_current_period')},"
                f" {q(None if instant else p['period_start'])}, {q(None if instant else p['made_up_to'])},"
                f" {q(p['made_up_to'] if instant else None)}, {q(original)}, {m['value']}, {q(unit)}, {q(ccy)}, 1,"
                f" {qj(dims)}, {q('accounts:page_' + str(m.get('page')) + ':' + str(m.get('location')))})",
                "  returning raw_fact_id into v_raw;",
                "  insert into public.finance_metric_values (financial_id, metric_key, value, currency, unit_scale,"
                " raw_fact_id, original_xbrl_concept, original_value, original_unit, filing_reference, document_id,"
                " source_url, mapping_version, validation_status, validation_notes)",
                f"  values (v_fin, {q(key)}, {m['value']}, {q(ccy)}, 1, v_raw, {q(concept)}, {q(original)},"
                f" {q(unit)}, {q('AA-' + mf['filed_date'])}, {q(tx)}, {q(url)}, {MAPPING_VERSION}, 'validated',"
                f" {q(unit_note)});",
            ]
    lines += [
        f"  select count(*) into v_n from public.finance_periods where team_id = {club['team_id']} and is_latest;",
        f"  if v_n <> 1 then raise exception '{club['slug']}: % latest periods', v_n; end if;",
        f"  select count(*) into v_n from public.finance_metric_values v join public.finance_periods p using (financial_id)"
        f" where p.team_id = {club['team_id']};",
        f"  if v_n <> {n_metrics} then raise exception '{club['slug']}: % metric values, expected {n_metrics}', v_n; end if;",
        "end $$;",
        "",
    ]
    return "\n".join(lines), sorted(used)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("config")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    cfg = json.loads(Path(a.config).read_text())
    blocks, used, companies = [], set(), []
    for club in cfg["clubs"]:
        sql, u = club_block(club, cfg["seasons"], cfg["run_label"])
        blocks.append(sql)
        used |= set(u)
        companies.append(json.loads(Path(club["extraction"]).read_text())["company_number"])
    head = [
        f"-- {cfg['title']}",
        "-- Generated by scripts/finance_pdf_load_sql.py from reviewed extractions.",
        "-- PRIVATE load: periods and values are 'validated', not 'published'.",
        "-- Safe to re-run: each club block skips when the team already has periods.",
        "",
        "insert into public.finance_metric_mappings (source, xbrl_concept, metric_key, mapping_version,"
        " context_rules, notes, is_active)",
        "values",
        ",\n".join(
            f"  ('companies_house', {q(CONCEPTS[k])}, {q(k)}, {MAPPING_VERSION}, "
            f"{qj({'extraction': 'statement_table_ocr_page_image_validation', 'period_type': 'instant' if k in INSTANT else 'duration', 'company_numbers': sorted(companies), 'document_format': 'PDF'})}, "
            f"{q('Generic PDF statement mapping v3 (scripts/finance_pdf_load_sql.py); page, label and derivation retained on each raw fact.')}, true)"
            for k in CONCEPTS if k in used),
        "on conflict (source, xbrl_concept, metric_key, mapping_version) do update",
        "  set context_rules = jsonb_set(finance_metric_mappings.context_rules, '{company_numbers}',",
        "    (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements(",
        "      coalesce(finance_metric_mappings.context_rules->'company_numbers', '[]'::jsonb)",
        "      || (excluded.context_rules->'company_numbers')) x));",
        "",
    ]
    Path(a.out).write_text("\n".join(head + blocks))


if __name__ == "__main__":
    main()

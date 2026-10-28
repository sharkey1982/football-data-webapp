# Finance statutory ingestion

FixtureShark's finance pipeline uses official electronic accounts from the
Companies House Accounts Data Product. Raw facts and unreviewed normalized data
remain private. Only periods and values explicitly marked `published` are
visible through the anonymous finance views.

## Importer

`scripts/import_finance_ixbrl.py` can parse a local iXBRL document or retrieve a
single filing from a multi-gigabyte Companies House ZIP64 archive.

The remote path does not download the complete archive. It:

1. reads the ZIP64 end record and central directory with HTTP range requests;
2. finds exactly one member from company number and balance-sheet date;
3. range-reads and CRC-checks only that member;
4. calculates the source document SHA-256; and
5. writes all inline XBRL facts to `raw-facts.json` in the shape expected by
   `finance_raw_facts`.

Example:

```bash
python scripts/import_finance_ixbrl.py \
  --archive-url https://download.companieshouse.gov.uk/Accounts_Monthly_Data-April2026.zip \
  --company-number 00089767 \
  --period-end 2025-07-31 \
  --filing-id 1 \
  --output-dir work/companies-house/southend-fy2025
```

The parser preserves concept, context, period or instant, original and numeric
values, unit, inline scale, dimensions, transformation metadata and source line.
Decimal values are serialized as strings so the database can ingest them without
binary floating-point loss.

## Validation and publication

Parsing is not publication. A filing should progress through these states:

`discovered -> extracted -> mapped -> validated`

Publication additionally requires:

- accounting period, company number and reporting entity checks;
- units, scale, signs and duplicate-context review;
- available profit-and-loss and balance-sheet reconciliations;
- explicit metric mappings with version and context rules;
- `published` status on both the period and its approved metric values; and
- an anonymous PostgREST test confirming public views work while the raw table
  remains inaccessible.

Missing disclosure is always `NULL`, never zero. An apparent zero is stored only
when the filing itself provides a zero/dash fact.

## Southend vertical slice

The first production slice covers Southend United Football Club Limited
(`team_id = 70`, company `00089767`) for FY2019-FY2025. The importer preserves
taxonomy-generation differences through versioned mappings.

FY2024 is marked `is_comparable = false`: its next-filed comparative changes
revenue by £2 and materially reclassifies operating loss, while leaving profit
before tax unchanged. The original FY2024 filing remains the published source
until metric-level restatement lineage is implemented.

## Migration reconciliation

The catalog-derived finance baseline is stored in
`supabase/migrations/20260921101758_finance_schema_baseline.sql` and recorded in
production migration history under the same version. It includes all eight
tables, constraints, indexes, RLS policies, three `security_invoker` views and
the 18-row metric dictionary.

The baseline is safe against the existing production objects and can bootstrap
the finance subsystem after the prerequisite `teams` and `seasons` tables have
been created. Browser roles receive `SELECT` only on the reviewed public
objects; raw ingestion tables remain private. Run
`supabase/tests/finance_schema_contract.sql` after future finance DDL changes to
detect contract or privilege drift.

The two transient-stage migrations (`20260922092911`, `20260924045456`) were
applied in production during the initial ingestion but only committed on
2026-10-26, for history. Both predate the apply-migrations floor, so they are
never replayed; the stage table itself was dropped on 2026-10-22.

## Loading rules from 2026-10-26

- **Fetching:** work sessions cannot reach Companies House. Dispatch
  `.github/workflows/finance-fetch.yml` with company numbers; it commits the
  original documents plus a manifest (source URL, retrieval time, bytes,
  SHA-256) to the `finance-sources` branch (never main), which the session
  reads with git. Run artifacts can't be used: their storage is blocked too.
- **Loading:** like every other database write, finance rows reach production
  only through a migration file applied by `apply-migrations.yml` — never the
  Supabase connector. One file per club batch loads private rows
  (`validation_status = 'validated'`); publication is a separate, later file
  that flips the reviewed period and its metric values to `published`.
- **Currency:** every amount is shown in the currency its period was filed in
  and never converted (`currencySymbol` in `src/lib/financeFormat.ts`). Cross-club
  comparisons use GBP clubs only and name any club left out. Non-GBP clubs can be
  published (Real Madrid, EUR, from 2026-10-26).
- **Club reports abroad:** `finance-fetch.yml` also takes `reports` (slug=https URL)
  and commits those documents to `finance-sources/annual-reports/<slug>/`.

## Batch audit: Wolves, Burnley, Southampton (2026-10-26)

Sources: Companies House full accounts (image PDFs, OCR located pages, every
figure confirmed against the page image; Burnley FY2024-25 also cross-checked
to the iXBRL facts). Load: `20261026110000_finance_load_wolves_burnley_southampton.sql`
(private, `validated`), generated by `scripts/finance_pdf_load_sql.py`.
Mapping set: `pdf:*` concepts, `mapping_version` 3.

| Club (team, company) | Periods | Values | Scope | Non-comparable | Notes |
|---|---|---|---|---|---|
| Wolves (43, 01989823) | FY2020-FY2025 | 107 | company | FY2024 (turnover split reclassified in FY2025 filing), FY2025 (13 months) | Borrowings = bank loans only; £160-248m group balances excluded (no group interest charged). FY2025 has no "other" turnover line (null). |
| Burnley (19, 00054222) | FY2020-FY2025 | 94 | company | FY2020 (13 months), FY2021-FY2023 (restated in later filings) | Operating result = line "including player trading". Borrowings = bank + factored transfer receivables; FY2020-21 null (acquisition loan sat in parent). No impairment line printed (null). |
| Southampton (16, 00053301) | FY2020-FY2025 | 101 | company | none | Borrowings: 0 in FY2020 (report: club gross debt nil; parent's £78.8m term loan excluded) and FY2022; null FY2021, FY2023-25. Impairment null FY2022-24 (no line printed). |

All 18 periods reconcile exactly: revenue categories = turnover, operating
result -> PBT, PBT - tax = PAT, total assets - total liabilities = net assets.

Also in this change: `20261026100000_finance_mapping_provenance_backfill.sql`
registers the 78 (concept, metric, version) combinations that 785 existing
values cited without a mapping row. No values change.

## Real Madrid (team 146) re-verification and fill (2026-10-26)

All 72 previously loaded values re-checked against the page images of the six
audited reports (same SHA-256 as loaded): 0 mismatches; every next-report
comparative agrees. Filled from the reports
(`20261026130000_finance_real_madrid_fill.sql`), 30 values:
borrowings (bank borrowings + the Bernabéu remodelling loans carried in "Other
financial liabilities"; leases, transfer and trade creditors excluded),
average employees, player amortisation (player registrations only, all
sections), player impairment (stored as a charge; FY2020, FY2021 and FY2023 are
net reversals, shown as negative and labelled as reversals) and profit on player
disposals (note 4.3 net gain after carrying amount; FY2023 excludes a €15.0m
tax-provision release). Matchday stays NULL: the reports bundle it with
membership, tours and other stadium income, which sits in `revenue_other`.
FY2020–FY2022 stay non-comparable (COVID; consolidation from FY2022).

## Batch audit: six Championship clubs (2026-10-28)

Companies House full accounts (image PDFs; OCR to find pages, every figure
confirmed against the page image; Watford FY2022/24/25 cross-checked to iXBRL).
Load `20261028100000_finance_load_championship_six.sql` (private), then the
guarded publish `20261028100500_finance_publish_championship_six.sql` (runs only
if exactly 36 periods / 634 values / 6 latest are present). All 36 periods
reconcile exactly (categories = turnover, operating -> PBT -> PAT, assets -
liabilities = net assets).

| Club (team, company) | Values | Scope | Non-comparable | Notes |
|---|---|---|---|---|
| Sheffield United (63, 00061564) | 103 | company | FY2020 (13m), FY2021 (11m), FY2023 (restated; FTE headcount) | Borrowings: bank + factored loans; FY2020 null (interest charged, no loan disclosed). |
| Middlesbrough (33, 01947851) | 107 | company | FY2020 (restated: deferred tax) | Borrowings: bank loans only (FY2023+); group/EFL/director loans interest-free. FY2020 null. 2024 debt-for-equity swap (GBP148.7m). |
| Norwich (44, 00154044) | 108 | group (PLC) | FY2020 (13m, amended filing), FY2021 (11m), FY2022 (VAT restatement) | Borrowings include Norfolk shareholder loans (interest-bearing per the reports) and the FY2020 mini-bond. |
| West Brom (11, 03295063) | 101 | company | FY2020 (13m), FY2021 (11m) | Borrowings: FY2024 factoring only; MSD loan sits in the parent. Other revenue null (never printed). |
| Stoke (9, 00099885) | 108 | company | FY2020, FY2021 (COVID season split across 31 May year end; FY2021 staff restated) | Borrowings nil: owner funding disclosed as interest-free. FY2022 includes GBP120m loan waiver. |
| Watford (39, 00104194) | 107 | company | FY2020-FY2022 (operating line excluded player sales until FY2023; FY2021 restated) | Borrowings: lender and Hornets Investment loans (interest-bearing). Amortisation shown net of impairment. |

## Batch audit: five more Championship clubs (2026-10-28)

Companies House full accounts (image PDFs, page-image verified; Bristol City
FY2025 cross-checked to iXBRL). Load `20261028120000_...` (private), then the
guarded publish `20261028120500_...` (27 periods / 452 values / 5 latest). All
periods reconcile exactly. A standing rule now runs before every load
(`finalise` step): a zero that the filing does not print becomes NULL, except a
borrowings nil the filing states (loans "interest-free" / "non-interest-bearing").

| Club (team, company) | Periods | Values | Non-comparable | Notes |
|---|---|---|---|---|
| Birmingham (34, 00027318) | FY2020-25 | 96 | FY2021 (restated) | Borrowings: FY2024-25 are the 11.9% Knighthead facility as printed (rounded to GBP0.1m). Other revenue not disclosed. |
| Blackburn (21, 00053482) | FY2020-25 | 101 | none | Overdraft only; parent loans interest-free. FY2023 borrowings null. |
| Bristol City (64, 03230871) | FY2020-25 | 106 | FY2020-21 (COVID split, 31 May year end), FY2023 (13m) | Pula Sport loan (3%) from FY2022. |
| Cardiff (22, 00109065) | FY2020-25 | 100 | FY2020-21 (COVID split), FY2023-24 (restated) | Interest-bearing shareholder/director/finance loans; Sala provision not borrowings. |
| Derby (27, 14190771) | FY2023-25 | 49 | FY2023 (first period after administration; restated) | New company since the July 2022 takeover; the old company filed nothing for 2019/20-2021/22. |

**QPR held back:** company 00060094 is the football-operations subsidiary (its
revenue is mostly a management charge to QPR Holdings Limited; matchday and
commercial income sit elsewhere). Publish QPR from QPR Holdings' consolidated
accounts instead.

## Batch audit: seven more clubs (2026-10-28)

Load `20261028130000_...` (private) then guarded publish `20261028130500_...`
(42 periods / 671 values / 7 latest). Portsmouth and Wrexham (all years) and
Millwall FY2025 were read from their iXBRL documents' exact text (no OCR); the
rest from page-image-verified scanned PDFs. All periods reconcile exactly except
Charlton FY2025 (turnover note GBP1k above the P&L line: rounding in the filing,
both kept as printed).

| Club (team, company) | Values | Scope | Non-comparable | Notes |
|---|---|---|---|---|
| QPR (7, 03197756) | 102 | group (QPR Holdings) | FY2020-21 (COVID split; FY2021 restated) | Replaces the earlier held-back subsidiary. Bonds (6%, 8%) are the borrowings. |
| Charlton (24, 01788466) | 104 | company | FY2021 (revenue reclassified), FY2022 (staff restated) | Owner/group loans stated interest-free. |
| Millwall (35, 01924222) | 94 | company | FY2024 (restated, new auditor) | FY2021-23 borrowings null (EFL loan terms not stated). |
| Portsmouth (82, 07940335) | 96 | company | FY2023 (revenue re-analysed) | No operating-profit line in any year. FY2025 GBP8m owner loan. |
| Preston (59, 00039494) | 101 | company | FY2020 (headcount restated) | Loans at stated nil rate; owner funds via shares. |
| Swansea (6, 04305508) | 106 | group | FY2024 (11m) | Owner convertible notes (5%) counted. |
| Wrexham (102, 07698872) | 68 | company | none | FY2020-22 small-company accounts: no P&L filed. Owner loan at base + 3%. |

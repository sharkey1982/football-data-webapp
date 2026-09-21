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

The finance foundation currently exists in production, but it is absent from
both the repository's migration files and Supabase migration history. Do not run
a newly reconstructed foundation DDL against production. The next schema task
must generate and review a reconciliation migration from the live catalog,
including constraints, grants, RLS policies and `security_invoker` view options,
then record it without recreating live objects.

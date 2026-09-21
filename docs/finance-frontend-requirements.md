# FixtureShark — Finance: frontend requirements for the backend

**From:** Claude (frontend)  **To:** ChatGPT (finance backend)
**Repo state reviewed:** `sharkey1982/football-data-webapp` at `daee95e`
**Database state reviewed:** Supabase project `ppzfmpbnojyjeblelsuz`, read-only

This document describes what the existing FixtureShark frontend needs from the finance data layer, so the backend can be shaped once rather than reworked later. Nothing here was built: no tables, migrations, functions or jobs were created.

---

## Current state

- **No finance-related tables, views, routes or components exist.** A search of `public` and `private` for anything matching finance, filing, reporting entity, XBRL, account or club returned nothing. There is nothing to duplicate or migrate from.
- **The canonical entity is `teams`**, not clubs. Columns: `team_id` (bigint, PK), `slug` (text, not null), `display_name`, `canonical_name`, `country_id`, `created_at`.
- The three proof-of-concept clubs each resolve to exactly one row:

| team_id | slug | display_name |
|---|---|---|
| 1 | `arsenal` | Arsenal |
| 15 | `liverpool` | Liverpool |
| 70 | `southend` | Southend |

Note Southend's slug is `southend`, while its company is "Southend United Football Club Limited". Football names and legal names diverge, which is why the join must be on `team_id`.

---

## Routes the frontend will use

- **Club finance page:** `/football/teams/:slug/finances` — extends the existing `/football/teams/:slug` team page. No routing conflicts.
- **League-wide finance hub:** `/finance` (proposed), mirroring the existing `/fpl` pillar.
  - `/football/finance` is **not** recommended. A catch-all route `football/:stage` already exists for the journey pages and would capture it unless declared explicitly first.

---

## How pages are rendered — and why it shapes the data contract

Team pages are **statically generated** for SEO. `scripts/generate-static.mjs` renders every page at build time using a small number of **bulk** queries against PostgREST — deliberately "three requests total, not one per page". Each page component accepts an `initialData` prop and is rendered server-side through `src/entry-server.tsx`.

**Consequence:** finance data must be readable in bulk, by the anonymous role, through PostgREST. A function that returns one club at a time would force one request per page and break the build pattern.

**Second consequence:** static generation and the sitemap currently include **Premier League teams only**. Southend has no static page today. Finance pages will need their own inclusion rule — *any team with published financials* — which the frontend will implement. The backend just needs a way to query which teams have published data.

---

## Requested data shape

### 1. Published periods — one row per team per reporting period

A flat view, readable by `anon`, bulk-queryable.

```json
{
  "team_id": 15,
  "period_start": "2023-06-01",
  "period_end": "2024-05-31",
  "period_months": 12,
  "season_id": 12,
  "reporting_entity": "The Liverpool Football Club and Athletic Grounds Limited",
  "company_number": "00035668",
  "is_consolidated": true,
  "currency": "GBP",
  "unit_scale": 1,

  "revenue_total": 613800000,
  "revenue_matchday": null,
  "revenue_broadcast": 245000000,
  "revenue_commercial": null,
  "revenue_other": null,
  "staff_costs": 386000000,
  "player_amortisation": null,
  "player_impairment": null,
  "profit_on_player_disposals": null,
  "operating_profit": null,
  "profit_before_tax": null,
  "profit_after_tax": null,
  "cash": null,
  "borrowings": null,
  "total_assets": null,
  "total_liabilities": null,
  "net_assets": null,
  "average_employees": null,

  "is_latest": true,
  "is_comparable": true,
  "filing_date": "2025-02-28",
  "source_url": "…",
  "validation_status": "validated"
}
```

*All values above are illustrative placeholders, not real figures.*

### 2. Provenance — companion view

One row per published metric value, joinable to the period row: `team_id`, `period_end`, `metric_key`, original XBRL concept, original value and unit, filing reference, document ID or URL, mapping version.

### 3. Derived metrics — a separate view

Staff-cost ratio, revenue per league point, staff costs per point, and so on. These must be **kept apart from statutory figures** so the frontend can label them as FixtureShark-derived. Each row needs a `metric_key`, `value`, a human-readable definition, and a `calculation_version`.

---

## Fields to include now, to avoid awkward frontend work later

1. **`team_id` as the only join key.** Never match on names. Please do not introduce a `club_id` — that would start a parallel identity system alongside `teams`.
2. **`period_months`.** Clubs change year-end and file 13- or 18-month accounts. Without this, a trend chart shows a revenue "jump" that is really just a longer period.
3. **`season_id`** — the football season the period mostly covers, referencing the existing `seasons` table. Every football-and-finance metric (revenue per point, resources versus Team Strength) depends on this join.
4. **`is_latest` plus restatement lineage.** Later accounts restate prior-year comparatives. The page must show the current figure and be able to flag that it was restated.
5. **`is_comparable`.** A simple flag for any period that should be excluded from a trend line — non-12-month periods, a change of reporting entity, a change of basis.
6. **Null distinct from zero.** A missing disclosure must be `null`, never `0`, and never estimated.
7. **`currency` and `unit_scale`.** Accounts are frequently presented in £000. The frontend should never have to guess.
8. **`is_consolidated` and the reporting entity name** on every row. The page states this in its header and in the source text.
9. **`filing_date` and a source URL or document ID** on every row. The page shows "last updated" and links to the source; the sitemap uses the filing date as `lastmod`.
10. **A validation status**, so unreviewed extractions can be withheld from publication.

---

## Security and change control

These rules come from a recent security audit of this project.

- **Every public-read table or view:** RLS enabled, plus an explicit public-read policy.
- **Every new function:** `CREATE FUNCTION` grants `EXECUTE` to `PUBLIC` by default. Revoke `anon` and `PUBLIC` execute **in the same migration that creates the function**. This trap has fired twice on this project, once opening a real hole.
- **Security-definer functions:** pin `search_path`.
- **Migrations:** commit every one under `supabase/migrations/`. The project had roughly 335 migrations applied with none in version control until recently.

---

## Naming consistency with the existing schema

- The canonical entity is `teams` and its key is `team_id`. `club_*` table names are fine; the foreign key should still be `team_id`.
- Existing ingestion-run tables are named `fpl_ingestion_runs` and `result_ingestion_runs`. A finance equivalent following the same pattern would be consistent.
- Football seasons live in `seasons`; labels use the form `2627`. Financial periods should be stored as dates, with `season_id` as the mapping — not as season labels.

---

## Coordination

More than one agent is currently doing database work on this project. Suggest that exactly one agent owns schema migrations at any one time, and that the owner is agreed before changes are made.

---

## Summary checklist

1. Join everything to `teams.team_id`. No name matching; no `club_id`.
2. Publish through flat views readable by `anon` in bulk, with RLS and explicit read policies.
3. One row per team per reporting period, with period dates, `period_months`, `season_id`, consolidation status, entity and company number.
4. Null means not disclosed. Never zero, never estimated.
5. Flag `is_latest` and `is_comparable`; keep restatement lineage.
6. Derived metrics in a separate, versioned, clearly labelled view.
7. Per-row provenance: filing date, source reference, original XBRL concept, validation status.
8. Explicit `currency` and `unit_scale`.
9. Revoke `anon`/`PUBLIC` execute on every new function in its own migration; commit all migrations.
10. Expect static pages for any team with published financials, not only Premier League clubs.

Once the data layer is working, hand the final schema and view definitions back and the frontend will be built against them.

# Supabase: change control

## Why this directory exists

Until now the production Supabase project had ~335 applied migrations and
5 deployed Edge Functions, and this repo contained **zero** of either.
There was no way to rebuild the database, and no copy of the Edge
Function source anywhere but the running deployment. Losing the project
would have meant losing all of it.

This is the start of closing that gap. It is **not finished** -- read
"What is still missing" before relying on it.

## What is here now

`functions/` -- source recovered from the live deployment via the
Supabase management API on 2026-09-20, byte-for-byte as deployed:

| Function | verify_jwt | Notes |
|---|---|---|
| `ingest-football-results` | false | **A STUB.** Inserts a `result_ingestion_runs` row on every call, counts enabled competitions, returns `{status:'test'}`. It does not ingest anything. Publicly callable. |
| `ingest-cup-data` | false | Real. Scrapes footballwebpages for LC + FAC, upserts fixtures/matches, then calls `backfill_fixture_predictions()`. Service-role writes. |
| `backfill-football-raw` | false | Real. Fetches football-data.co.uk CSVs, upserts `raw_match_files` / `source_match_rows`. Service-role writes. |
| `backfill-cup-raw` | false | Real. Scrapes footballwebpages HTML into the same raw tables. Service-role writes. |
| `fpl-optimize-squad` | false | **NOT YET EXPORTED** -- see below. |

`config.toml` -- enough to link the project and deploy functions.
`migrations/` -- empty. See below.

## Open security finding (recorded, not yet fixed)

All five functions are `verify_jwt = false` and the four ingest/backfill
ones use the service-role key with no authentication of their own. Any
anonymous caller can therefore make the server scrape third-party sites
and write rows. That is a cost/abuse problem rather than a data-integrity
one (they are idempotent upserts), but it is real:

- `ingest-football-results` is a stub that writes a junk run row on every
  call. It should be **deleted**, not secured -- nothing calls it.
- The three real ones should take a shared webhook secret (they are
  machine-called, not user-called), not a JWT.
- `fpl-optimize-squad` is deliberately public-facing; it needs input
  limits, rate limiting and caching rather than auth.

Do this before any public launch.

## What is still missing

1. **`fpl-optimize-squad` source.** Not exported here yet; it is the
   largest and most-iterated function (v21). Export it with the CLI:

   ```
   supabase functions download fpl-optimize-squad --project-ref ppzfmpbnojyjeblelsuz
   ```

2. **A schema baseline.** The real fix is a `pg_dump` of the production
   schema committed as `migrations/00000000000000_baseline.sql`. This
   cannot be produced from inside the agent sandbox (no CLI, and
   supabase.com is outside the allowed network egress). Run locally:

   ```
   supabase link --project-ref ppzfmpbnojyjeblelsuz
   ```

   ```
   supabase db dump --schema public --file supabase/migrations/00000000000000_baseline.sql
   ```

   ```
   supabase db dump --schema private --file supabase/migrations/00000000000001_baseline_private.sql
   ```

   Then reconcile history so the CLI does not try to replay it against
   production:

   ```
   supabase migration repair --status applied 00000000000000
   ```

   **Do not** run `supabase db reset` or `supabase db push` against
   production while reconciling. Dump, commit, repair -- in that order.

3. **Drift checking in CI**, once a baseline exists.

## Day-to-day, once a baseline exists

New migration:

```
supabase migration new descriptive_name
```

Apply to production:

```
supabase db push
```

Deploy one function:

```
supabase functions deploy ingest-cup-data --project-ref ppzfmpbnojyjeblelsuz
```

## Environment variables

Never committed. Edge Functions read `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`, both injected by the platform. The frontend
uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (Netlify).
`netlify/functions/trigger-workflow.ts` additionally needs
`GITHUB_ACTIONS_TOKEN`, set in Netlify only.

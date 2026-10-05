# FixtureShark (football-data-webapp): rules for Claude sessions

## Database changes: always through a migration file, never the connector

The Supabase connector (`apply_migration`, `execute_sql`) is for **reads only**.
Every change to the database (schema, data, UPDATE, DELETE, INSERT, a Model Lab
registration or conclusion) goes in a file under `supabase/migrations/` and
reaches the database through `.github/workflows/apply-migrations.yml`.

- **Normal path:** commit the file in your PR. When the PR is merged to main,
  the workflow applies every newly added file in name order, each in one
  transaction, and records it in `public.repo_migrations`. Merging the PR is
  the approval.
- **Needed before the merge** (e.g. a Model Lab registration that must exist
  before you score): push the file to main in its own small PR and merge it
  first. Or dispatch the workflow on demand with `file=<name>`; the file must
  already be on main.
  - Dispatch: `gh api -X POST repos/sharkey1982/football-data-webapp/actions/workflows/apply-migrations.yml/dispatches -f ref=main -f "inputs[file]=<name>"`
  - Several files go in one run, comma separated. Queued runs replace each
    other, so don't dispatch twice in a row.
- **Never apply a file through the connector and also commit it.** The
  workflow will run it again. If it isn't idempotent the run fails, and the
  files after it in that push are not applied. This happened on 5 Oct 2026.
- **If a file was already run another way,** record it without running it:
  dispatch with `file=<name>` and `inputs[mark_only]=true`.
- **To check:** `select * from public.repo_migrations order by applied_at desc`
  (a read, so the connector is fine). Workflow logs can't be read from a
  cloud session. Read the record table, or the run's step results
  (`gh api .../actions/runs/<id>/jobs`).
- **Make data migrations safe to re-run where it's cheap:**
  `insert ... on conflict do nothing`, `update ... where <not already done>`.

Why: connector UPDATE and DELETE calls are cancelled at an approval step that
never reaches Chris. INSERTs and new tables go through, but only some writes
succeeding is worse than one route that always works.

## Before you push

Run these in order:

1. `npx tsc --noEmit -p tsconfig.app.json`
2. `npm run build`
3. `timeout 580 npx vitest run`

Then open the PR with `gh api repos/sharkey1982/football-data-webapp/pulls`
(REST: GraphQL is blocked). Wait for the Netlify statuses, then squash-merge
with `gh api -X PUT .../pulls/<n>/merge -f merge_method=squash`.

## Model Lab

Register an experiment (migration, merged first) before scoring it, and score
the holdout once. Splits and results are in `docs/experiments.md`.

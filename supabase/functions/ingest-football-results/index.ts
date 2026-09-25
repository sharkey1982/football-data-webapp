// ingest-football-results -- RETIRED 2026-09-25.
//
// This was a stub: every call inserted a 'running' row into
// result_ingestion_runs and returned {status:'test'} without ingesting
// anything (junk rows 11-17 Sept 2026). Nothing calls it: football-data.co.uk
// results arrive via the GitHub Actions daily import. Tooling cannot delete
// an Edge Function, so it is neutralised instead: it now requires a JWT
// (anonymous calls are rejected before this runs) and writes nothing.
// Delete it in the Supabase dashboard whenever convenient.
Deno.serve(() =>
  Response.json(
    { status: 'retired', message: 'ingest-football-results is retired and does nothing.' },
    { status: 410 },
  )
);

// backfill-cup-raw -- RETIRED 2026-10-22 (audit SEC-01).
//
// A one-off backfill that ran with the service role and no auth (verify_jwt
// off), so anyone could make it write unlimited raw rows. Nothing calls it.
// Tooling cannot delete an Edge Function, so this one now requires a JWT and
// does nothing; the old source is in git history. Delete it in the Supabase
// dashboard whenever convenient.
Deno.serve(() =>
  Response.json({ status: 'retired', message: 'backfill-cup-raw is retired.' }, { status: 410 })
);

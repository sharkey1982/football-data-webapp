// fpl-entry -- RETIRED 2026-09-30, the day it was created.
//
// The FPL API refused about half its calls with a 403 (Cloudflare blocks many
// cloud servers). Squad Check now calls public.fpl_entry_fetch() in the
// database, whose requests FPL accepts. Tooling cannot delete an Edge
// Function, so this one now requires a JWT and does nothing. Delete it in the
// Supabase dashboard whenever convenient.
Deno.serve(() =>
  Response.json({ status: 'retired', message: 'fpl-entry is retired; use the fpl_entry_fetch RPC.' }, { status: 410 })
);

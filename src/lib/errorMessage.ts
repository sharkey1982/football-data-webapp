// ============================================================================
// src/lib/errorMessage.ts
//
// Supabase-js query errors (PostgrestError) are plain objects shaped like
// { message, details, hint, code } -- they are NOT `instanceof Error`. Every
// catch block across the FPL pages was doing
// `e instanceof Error ? e.message : '<generic fallback>'`, which meant a
// real, specific Postgres/PostgREST error (permission denied, bad filter,
// etc.) was silently replaced with an unhelpful generic string every time --
// exactly the kind of thing that makes "it's broken" hard to diagnose from a
// screenshot. This pulls a usable message out of anything thrown, whatever
// shape it is.
// ============================================================================

export function getErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  if (typeof e === 'string') return e;
  return fallback;
}

/** Database, API and network errors: PostgREST errors carry code/details/hint;
 * the rest are recognised by their wording. Messages our own code throws for
 * the visitor ("no FPL team with that ID", "No legal squad found") are not. */
function isTechnical(e: unknown): boolean {
  if (e && typeof e === 'object' && ('code' in e || 'details' in e || 'hint' in e)) return true;
  const msg = getErrorMessage(e, '');
  return !msg || /fetch|network|timeout|timed out|statement|permission|relation|column|syntax|jwt|pgrst|postgres|sql|schema|function .*does not exist|status code|\b[45]\d\d\b/i.test(msg);
}

/** For public pages (audit 22 Oct 2026, S-19): a plain sentence for the
 * visitor instead of raw database or network text ("permission denied for
 * table ...", "canceling statement due to statement timeout", "Failed to
 * fetch"); the raw error goes to the console. A message our own code wrote
 * for the visitor passes through. Admin pages keep getErrorMessage. */
export function friendlyError(e: unknown, what: string): string {
  if (!isTechnical(e)) return getErrorMessage(e, what);
  console.error(`${what}:`, getErrorMessage(e, 'unknown error'), e);
  return `${what.replace(/[.\s]+$/, '')}. Please try again in a moment.`;
}

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

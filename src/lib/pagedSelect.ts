// Read every row of a PostgREST select, a page at a time.
//
// PostgREST returns at most 1,000 rows per request (the project's max_rows),
// silently: a select that matches 2,158 rows gives back 1,000 and no error.
// Audit 2026-10-22 (CODE-04) found reads already past that cap
// (fpl_player_gameweeks for the tactical-roles averages) and close to it
// (team_aliases in the daily import). Use this for any read that can grow
// beyond a few hundred rows.
//
// The query MUST have a total order (order by a unique key, or a set of
// columns that is unique), or rows can repeat or go missing between pages.
// This file has no imports, so scripts (tsx) can use it as well as the site.

/** PostgREST's per-request row cap for this project. */
export const POSTGREST_MAX_ROWS = 1000;

type PageResult<T> = { data: T[] | null; error: unknown };

/**
 * Calls `page(from, to)` for consecutive inclusive ranges until a page comes
 * back short, and returns all rows. `page` builds the query and ends it with
 * `.range(from, to)`. Throws the first error. `maxRows` is a safety stop
 * against a runaway loop (default 200,000 rows).
 */
export async function selectAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  opts: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const pageSize = Math.min(opts.pageSize ?? POSTGREST_MAX_ROWS, POSTGREST_MAX_ROWS);
  const maxRows = opts.maxRows ?? 200_000;
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
  throw new Error(`selectAllPages: stopped after ${maxRows} rows; narrow the query or raise maxRows`);
}

/** Splits a list into chunks, for `.in(col, ids)` filters too long for one URL. */
export function chunk<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

// A small PostgREST fake for tests that enforces the 1,000-row cap.
//
// Mocked supabase responses hide the cap: a test that returns 2,000 rows from
// a mock passes even though production would return 1,000 (audit 2026-10-22,
// CODE-04). This fake serves rows from an in-memory table and, like the real
// server, never returns more than POSTGREST_MAX_ROWS from one request.
//
// Supports the builder calls the paged readers use: select, eq, in, gt,
// order, range, limit, and awaiting the builder. Unknown filters throw so a
// test cannot pass by accident.
import { POSTGREST_MAX_ROWS } from '../../lib/pagedSelect';

type Row = Record<string, unknown>;

export function postgrestFake(tables: Record<string, Row[]>) {
  const calls: { table: string; range: [number, number] | null; rows: number }[] = [];

  function from(table: string) {
    const all = tables[table];
    if (!all) throw new Error(`postgrestFake: no table ${table}`);
    const filters: ((r: Row) => boolean)[] = [];
    const orders: { col: string; asc: boolean }[] = [];
    let range: [number, number] | null = null;
    let limit: number | null = null;

    const builder = {
      select: () => builder,
      eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), builder),
      in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), builder),
      gt: (col: string, v: number) => (filters.push((r) => typeof r[col] === 'number' && (r[col] as number) > v), builder),
      order: (col: string, o?: { ascending?: boolean }) => (orders.push({ col, asc: o?.ascending !== false }), builder),
      range: (a: number, b: number) => ((range = [a, b]), builder),
      limit: (n: number) => ((limit = n), builder),
      then<R1, R2 = never>(ok?: ((v: { data: Row[]; error: null }) => R1) | null, bad?: ((e: unknown) => R2) | null) {
        let rows = all.filter((r) => filters.every((f) => f(r)));
        if (orders.length) {
          rows = [...rows].sort((x, y) => {
            for (const o of orders) {
              const a = x[o.col] as number | string;
              const b = y[o.col] as number | string;
              if (a !== b) return (a < b ? -1 : 1) * (o.asc ? 1 : -1);
            }
            return 0;
          });
        }
        const start = range ? range[0] : 0;
        const wanted = range ? range[1] - range[0] + 1 : limit ?? Infinity;
        rows = rows.slice(start, start + Math.min(wanted, limit ?? Infinity, POSTGREST_MAX_ROWS));
        calls.push({ table, range, rows: rows.length });
        return Promise.resolve({ data: rows, error: null }).then(ok, bad);
      },
    };
    return builder;
  }

  return { from, calls };
}

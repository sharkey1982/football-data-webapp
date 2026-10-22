// Regression guards (22 Oct 2026, audit DQ-08 / S-13 / DQ-07). The FPL
// projection pipeline lives in SQL and Python; these check that the latest
// migration-defined versions keep the three fixes:
//   1. team sheets are scaled UP to 10 outfield + 1 keeper, within availability;
//   2. the refresh script pulls fresh FPL news before computing availability;
//   3. a fixture is not regenerated once it has kicked off.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const migrationsDir = join(root, 'supabase', 'migrations');

/** Text of the last migration (by file name) that matches `pattern`. */
function latestDefinition(pattern: RegExp): string {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(migrationsDir, files[i]), 'utf8');
    const m = sql.match(pattern);
    if (m) return sql.slice(m.index ?? 0);
  }
  throw new Error(`no migration matches ${pattern}`);
}

/** The statement starting at the beginning of `text`, up to the first `;` at line end. */
function firstStatement(text: string): string {
  const end = text.search(/;\s*$/m);
  return end < 0 ? text : text.slice(0, end);
}

describe('FPL projection guards', () => {
  it('resolved_v3 scales a short team up, capped at availability', () => {
    const view = firstStatement(
      latestDefinition(/create or replace view public\.fixture_player_expected_minutes_resolved_v3 /i),
    );
    // The existing scale-down is still there...
    expect(view).toMatch(/t\.team_start - \(10\)::numeric/);
    // ...and the scale-up targets 1 keeper / 10 outfield players,
    expect(view).toMatch(/CASE WHEN h\.is_gk THEN \(1\)::numeric ELSE \(10\)::numeric END\) - sum\(h\.s1\)/);
    // never above a player's availability (or 0.98),
    expect(view).toMatch(/LEAST\(0\.98, COALESCE\(c\.availability_probability, \(1\)::numeric\)\)/);
    // and a start chance already above availability (a stale depth chart:
    // Saka 50% at 0.94) is cut back to it before the scale-up.
    expect(view).toMatch(
      /GREATEST\(\(0\)::numeric, COALESCE\(n\.new_start, n\.prob_starting_xi\) - COALESCE\(n\.availability_probability, \(1\)::numeric\)\) AS over_avail/,
    );
    expect(view).toMatch(/COALESCE\(c\.new_start, c\.prob_starting_xi\) - c\.over_avail AS s1/);
  });

  it('refresh_fpl_projection_fixture_v6 skips fixtures that have kicked off', () => {
    const fn = latestDefinition(/create or replace function public\.refresh_fpl_projection_fixture_v6\(/i);
    const body = fn.slice(0, fn.indexOf('$function$;') + 11);
    expect(body).toMatch(/v_status = 'played' or v_kickoff <= now\(\)/);
    expect(body).toMatch(/at time zone 'Europe\/London'/);
  });

  it('the refresh script refreshes FPL data before availability and projections', () => {
    const py = readFileSync(join(root, 'scripts', 'refresh_fpl_projections.py'), 'utf8');
    const fpl = py.indexOf('call("refresh_fpl")');
    const availability = py.indexOf('call("refresh_fpl_fixture_availability")');
    const projections = py.indexOf('call("refresh_fpl_projection_fixture_v6", fixture_id)');
    expect(fpl).toBeGreaterThan(0);
    expect(availability).toBeGreaterThan(fpl);
    expect(projections).toBeGreaterThan(availability);
  });
});

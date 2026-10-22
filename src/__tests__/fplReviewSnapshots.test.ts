// Regression guard (22 Oct 2026, audit DQ-07): the "model vs actual" reviews
// must read projections as they stood at the FPL deadline
// (fpl_review_projections_v6), not the live fpl_player_projections rows,
// which used to be rewritten after kick-off.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(__dirname, '..', '..', 'supabase', 'migrations');
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

/** The latest migration's definition of `name`, up to its closing $function$ or `;`. */
function latest(header: RegExp, end: RegExp): string {
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(migrationsDir, files[i]), 'utf8');
    const m = sql.match(header);
    if (m) {
      const rest = sql.slice(m.index ?? 0);
      const e = rest.search(end);
      return e < 0 ? rest : rest.slice(0, e);
    }
  }
  throw new Error(`no migration defines ${header}`);
}

describe('FPL reviews read the deadline snapshot', () => {
  it('fpl_review_projections_v6 prefers pre_deadline, then late, snapshots', () => {
    const view = latest(/create or replace view public\.fpl_review_projections_v6 /i, /;\s*$/m);
    expect(view).toMatch(/snapshot_kind in \('pre_deadline', 'late'\)/);
    expect(view).toMatch(/\(s\.snapshot_kind = 'pre_deadline'\) desc/);
    expect(view).toMatch(/not exists \(select 1 from snap_events/);
  });

  for (const fn of ['get_totw_vs_model', 'get_model_xi_players', 'get_model_xi_history']) {
    it(`${fn} reads fpl_review_projections_v6`, () => {
      const body = latest(new RegExp(`create or replace function public\\.${fn}\\(`, 'i'), /\$function\$;/);
      expect(body).toMatch(/public\.fpl_review_projections_v6/);
      expect(body).not.toMatch(/fpl_player_projections/);
    });
  }

  it('fpl_prediction_actual_start_comparison puts the deadline version first', () => {
    const view = latest(/create or replace view public\.fpl_prediction_actual_start_comparison /i, /;\s*$/m);
    expect(view).toMatch(/FROM fpl_review_projections_v6 rp/);
    expect(view).toMatch(/ORDER BY q\.pri, q\.generated_at DESC/);
  });
});

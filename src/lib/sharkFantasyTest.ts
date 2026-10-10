// ============================================================================
// src/lib/sharkFantasyTest.ts
//
// Test leagues run from the admin's browser (Chris: start whenever, play
// sped up). The same runner as the weekly job (src/sharkfantasy/runner.ts),
// with the database calls going through public.sf_test_rpc, which only an
// admin may call and only for a test league (migration
// 20261010210000_shark_fantasy_test_leagues.sql).
// ============================================================================

import { supabase } from './supabase';
import { createSeason, advance, type RunnerDeps } from '../sharkfantasy/runner';
import type { BotKind, Solver } from '../sharkfantasy/fantasy/bots';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const TEST_BOTS: Partial<Record<BotKind, number>> = { optimiser: 4, template: 4, setforget: 4, chaser: 4, random: 8 };

let solverPromise: Promise<Solver> | null = null;
function loadSolver(): Promise<Solver> {
  solverPromise ??= (async () => {
    const [{ default: highsLoader }, { default: wasmUrl }] = await Promise.all([import('highs'), import('highs/runtime?url')]);
    const highs = await highsLoader({ locateFile: () => wasmUrl });
    return (lp: string) => highs.solve(lp) as unknown as ReturnType<Solver>;
  })();
  return solverPromise;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function deps(log: (m: string) => void): Promise<RunnerDeps> {
  return {
    rpc: async (fn, args) => {
      const { data, error } = await db.rpc('sf_test_rpc', { p_fn: fn, p_args: args });
      if (error) throw new Error(`${fn}: ${error.message}`);
      return data;
    },
    hash: sha256,
    solve: await loadSolver(),
    log,
  };
}

/** A new test league starting now: round 1 open, deadlines weekly (lock early to play on). */
export async function newTestLeague(log: (m: string) => void): Promise<string> {
  const d = await deps(log);
  const now = new Date();
  const stamp = now.toISOString().slice(2, 16).replace(/[-:T]/g, '').toLowerCase();
  const universe = `t-${stamp}`;
  await createSeason(d, { universe, name: `Test league ${now.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}`,
    seed: `${universe}-${Math.random().toString(36).slice(2, 8)}`, firstDeadline: new Date(now.getTime() + 7 * 86400_000), spacingMinutes: 7 * 24 * 60, kickoffAfterMinutes: 180, zone: 'Europe/London' });
  return universe;
}

/** Bots move, the round locks now and is played and scored. */
export async function playNextRound(universe: string, log: (m: string) => void): Promise<string> {
  const d = await deps(log);
  return advance(d, universe, { force: true, lineup: TEST_BOTS });
}

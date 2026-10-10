// ============================================================================
// Shark Fantasy: drive a universe in the database (src/sharkfantasy/runner.ts).
//
//   npx tsx scripts/sf/run-round.ts <command> [--universe proto] [options]
//
//   create  [--seed S] [--name N] [--first-deadline 2026-10-18T11:00:00Z]
//             generate the world and season 1: weekly deadlines from the first
//             (default a week from now), kick-off 3 hours after each. A test
//             universe (never made public) can be pushed through with --force:
//             a round locked early has its deadline and kick-off moved to now.
//   bots    [--bots optimiser=2,template=2,...]   bots move for the open round
//   lock    [--force]                            the deadline (force: test universes only)
//   play                                         play and commit the locked round
//   advance [--force] [--bots ...]               bots + lock + play when the deadline is due
//   season  [--bots ...]                         advance (forced) until the season is over
//
// Database: SUPABASE_URL + SUPABASE_SERVICE_KEY (service role), or
// --psql "<psql connection args>" for a local Postgres (tests).
// ============================================================================
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import highsLoader from 'highs';
import { createSeason, botsMove, lockRound, playLockedRound, advance } from '../../src/sharkfantasy/runner';
import type { Rpc, RunnerDeps } from '../../src/sharkfantasy/runner';
import type { BotKind, Solver } from '../../src/sharkfantasy/fantasy/bots';

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name: string, dflt?: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : dflt; };
const flag = (name: string) => argv.includes(`--${name}`);
const universe = opt('universe', 'proto')!;
const DEFAULT_BOTS = 'optimiser=4,template=4,setforget=4,chaser=4,random=8';
const lineup = Object.fromEntries((opt('bots', DEFAULT_BOTS) || '').split(',').filter(Boolean).map(x => { const [k, n] = x.split('='); return [k, Number(n)]; })) as Partial<Record<BotKind, number>>;

function psqlRpc(conn: string): Rpc {
  const dir = mkdtempSync(join(tmpdir(), 'sf-'));
  let n = 0;
  return async (fn, args) => {
    const lit = (v: unknown) => {
      if (v === null || v === undefined) return 'null';
      if (typeof v === 'number') return String(v);
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (typeof v === 'string') return `convert_from(decode('${Buffer.from(v).toString('base64')}', 'base64'), 'UTF8')`;
      return `convert_from(decode('${Buffer.from(JSON.stringify(v)).toString('base64')}', 'base64'), 'UTF8')::jsonb`;
    };
    const sql = `set role service_role;\nselect to_jsonb(public.${fn}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(', ')}));\n`;
    const file = join(dir, `q${++n}.sql`);
    writeFileSync(file, sql);
    const out = execFileSync('psql', [...conn.split(' '), '-v', 'ON_ERROR_STOP=1', '-q', '-At', '-f', file], { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
    return out ? JSON.parse(out) : null;
  };
}

function supabaseRpc(): Rpc {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required (or --psql)');
  const sb = createClient(url, key, { auth: { persistSession: false } });
  return async (fn, args) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
}

async function main() {
  const conn = opt('psql');
  const highs = await highsLoader();
  const solve: Solver = (lp) => highs.solve(lp) as unknown as ReturnType<Solver>;
  const d: RunnerDeps = { rpc: conn ? psqlRpc(conn) : supabaseRpc(), hash: s => createHash('sha256').update(s).digest('hex'), solve, log: m => console.log(m) };
  switch (cmd) {
    case 'create': {
      const fd = opt('first-deadline');
      const first = fd ? new Date(fd) : new Date(Date.now() + 7 * 24 * 3600_000);
      if (Number.isNaN(first.getTime())) throw new Error('--first-deadline: not a date');
      await createSeason(d, { universe, name: opt('name', 'Shark Fantasy (prototype)')!, seed: opt('seed', `${universe}-1`)!,
        firstDeadline: first, spacingMinutes: 7 * 24 * 60, kickoffAfterMinutes: 180, zone: 'Europe/London' });
      break;
    }
    case 'bots': await botsMove(d, universe, lineup); break;
    case 'lock': await lockRound(d, universe, flag('force')); break;
    case 'play': await playLockedRound(d, universe); break;
    case 'advance': console.log(await advance(d, universe, { force: flag('force'), lineup })); break;
    case 'season': {
      for (let i = 0; i < 12; i++) { const r = await advance(d, universe, { force: true, lineup }); if (r === 'season over') break; }
      console.log('season over');
      break;
    }
    default: throw new Error(`unknown command ${cmd ?? ''}`);
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

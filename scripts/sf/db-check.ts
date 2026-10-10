// ============================================================================
// Shark Fantasy: end-to-end check of the database layer against a local
// Postgres (the migration applied over a stub of Supabase's auth and roles).
//
//   npx tsx scripts/sf/db-check.ts --psql "-h /tmp/sfpg -p 5499 -U postgres -d sf_check"
//
// 1. Runs a whole test season through the database, one step at a time, with
//    24 bots, and checks every bot's total matches the same season played in
//    memory (src/sharkfantasy/fantasy/league.ts): the SQL rules mirror the
//    TypeScript ones (squads, money, transfers, hits, free transfers).
// 2. Re-running a lock or a round is a no-op; final rows refuse changes.
// 3. Visibility: anon and a non-admin see nothing of a non-public universe and
//    never the hidden tables; an admin sees the views; a user sees only their
//    own current picks.
// 4. A signed-in manager: join, save a squad, the rule checks, transfers and
//    hits through a deadline.
// ============================================================================
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import highsLoader from 'highs';
import { createSeason, advance } from '../../src/sharkfantasy/runner';
import type { Rpc } from '../../src/sharkfantasy/runner';
import { runLeague } from '../../src/sharkfantasy/fantasy/league';
import type { BotKind, Solver } from '../../src/sharkfantasy/fantasy/bots';
import { rulesFor } from '../../src/sharkfantasy/fantasy/rules';

const i = process.argv.indexOf('--psql');
if (i < 0) throw new Error('--psql "<connection args>" is required');
const conn = process.argv[i + 1].split(' ');
const ri = process.argv.indexOf('--rules');
const R = rulesFor(ri >= 0 ? process.argv[ri + 1] : 'sf-game-2-nosub');
const ADMIN = '00000000-0000-0000-0000-00000000000a', USER = '00000000-0000-0000-0000-00000000000b';

/** Run SQL as a role (and user); returns rows as JSON, or throws the error text. */
function sql(q: string, as: { role?: string; user?: string } = {}): unknown {
  const pre = `${as.role ? `set role ${as.role};` : ''}${as.user ? `set request.jwt.claim.sub = '${as.user}';` : ''}`;
  const out = execFileSync('psql', [...conn, '-v', 'ON_ERROR_STOP=1', '-q', '-At', '-f', '-'],
    { input: `${pre}\nselect coalesce(json_agg(t), '[]') from (${q}) t;\n`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1 << 28 }).trim();
  return JSON.parse(out);
}
/** Run a statement as is (DML); returns the error text, or null if it succeeded. */
function exec(q: string, as: { role?: string; user?: string } = {}): string | null {
  const pre = `${as.role ? `set role ${as.role};` : ''}${as.user ? `set request.jwt.claim.sub = '${as.user}';` : ''}`;
  try { execFileSync('psql', [...conn, '-v', 'ON_ERROR_STOP=1', '-q', '-At', '-f', '-'], { input: `${pre}\n${q};\n`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); return null; }
  catch (e) { return String((e as { stderr?: string }).stderr ?? e); }
}
function sqlError(q: string, as: { role?: string; user?: string } = {}): string | null {
  try { sql(q, as); return null; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); }
}
const rpc: Rpc = async (fn, args) => {
  const lit = (v: unknown) => v === null || v === undefined ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v)
    : `convert_from(decode('${Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64')}', 'base64'), 'UTF8')${typeof v === 'string' ? '' : '::jsonb'}`;
  const rows = sql(`select to_jsonb(public.${fn}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(', ')})) r`, { role: 'service_role' }) as { r: unknown }[];
  return rows[0].r;
};

let failures = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };

async function main() {
  const highs = await highsLoader();
  const solve: Solver = (lp) => highs.solve(lp) as unknown as ReturnType<Solver>;
  const d = { rpc, hash: (s: string) => createHash('sha256').update(s).digest('hex'), solve };
  const universe = 'check', seed = 'check-1';
  const lineup: Partial<Record<BotKind, number>> = { optimiser: 4, template: 4, setforget: 4, chaser: 4, random: 8 };

  console.log(`rules ${R.version}`);
  const season = await createSeason(d, { universe, name: 'Check', seed, firstDeadline: new Date(Date.now() + 86400_000), spacingMinutes: 1440, kickoffAfterMinutes: 180, rules: R });
  check(await createSeason(d, { universe, name: 'Check', seed, firstDeadline: new Date(), spacingMinutes: 1, kickoffAfterMinutes: 0, rules: R }) === season, 'creating the season again returns the same season');

  // 4. a signed-in manager (admin, since the universe is not public) joins before round 1
  check(/permission denied/.test(sqlError(`select public.sf_join(${season}, 'Nobody')`, { role: 'anon' }) ?? ''), 'anon cannot join');
  check(/not available/.test(sqlError(`select public.sf_join(${season}, 'User FC')`, { role: 'authenticated', user: USER }) ?? ''), 'a non-admin cannot join a non-public universe');
  const entry = (sql(`select public.sf_join(${season}, 'Admin FC', 'Chris') e`, { role: 'authenticated', user: ADMIN }) as { e: number }[])[0].e;
  check(entry > 0, 'an admin joins');
  // a legal squad from the cheapest players (two per club at most)
  const players = sql(`select player_id, position, club_id, price from public.sf_players where season_id = ${season} order by price, player_id`, { role: 'authenticated', user: ADMIN }) as { player_id: string; position: string; club_id: string; price: number }[];
  check(players.length === 150, 'an admin sees 150 players in the view');
  // XI 1-4-4-2, then the bench: sf-game-1 a keeper and 5/5/3 in all; sf-game-2 one midfielder; no-sub none
  const need: Record<string, number> = R.squadSize === 15 ? { GK: 2, DEF: 5, MID: 5, FWD: 3 } : R.squadSize === 12 ? { GK: 1, DEF: 4, MID: 5, FWD: 2 } : { GK: 1, DEF: 4, MID: 4, FWD: 2 };
  const perClub: Record<string, number> = {};
  const squad: typeof players = [];
  for (const p of players) if (need[p.position] > 0 && (perClub[p.club_id] ?? 0) < 2) { squad.push(p); need[p.position]--; perClub[p.club_id] = (perClub[p.club_id] ?? 0) + 1; }
  const byPos = (pos: string) => squad.filter(p => p.position === pos);
  const order = [byPos('GK')[0], ...byPos('DEF').slice(0, 4), ...byPos('MID').slice(0, 4), ...byPos('FWD').slice(0, 2),
    ...(R.squadSize === 15 ? [byPos('GK')[1], byPos('DEF')[4], byPos('MID')[4], byPos('FWD')[2]] : R.squadSize === 12 ? [byPos('MID')[4]] : [])];
  const N = R.squadSize;
  const team = (o: typeof order, extra = {}) => JSON.stringify({ picks: o.map((p, k) => ({ player_id: p.player_id, slot: k + 1 })), captain: o[9].player_id, vice: o[5].player_id, ...extra });
  const save = (t: string) => sql(`select public.sf_save_team(${season}, '${t}'::jsonb) r`, { role: 'authenticated', user: ADMIN }) as { r: { bank: number; transfers: number; hits_if_deadline_now: number } }[];
  const tryTeam = (o: typeof order) => sqlError(`select public.sf_save_team(${season}, '${team(o)}'::jsonb)`, { role: 'authenticated', user: ADMIN }) ?? '';
  if (R.reserveKeeperFirst) {
    const bad = [...order]; [bad[11], bad[12]] = [bad[12], bad[11]];
    check(/reserve keeper/.test(tryTeam(bad)), 'a lineup without the reserve keeper first on the bench is refused, with the reason');
  } else {
    const gk2 = players.find(p => p.position === 'GK' && p.player_id !== order[0].player_id && (perClub[p.club_id] ?? 0) < 3)!;
    const bad = [...order]; bad[1] = gk2;     // two keepers in the XI, three defenders
    check(/GK in the XI|GK \(/.test(tryTeam(bad)), 'a lineup with two keepers starting is refused, with the reason');
  }
  const dup = [...order]; dup[N - 1] = order[N - 2];
  check(/used twice/.test(tryTeam(dup)), 'a player picked twice is refused');
  const rich = players.filter(p => p.position === 'MID').slice(-5);
  const richF = players.filter(p => p.position === 'FWD').slice(-3);
  const richD = players.filter(p => p.position === 'DEF').slice(-4);
  const pricey = [...order]; [0, 1, 2, 3].forEach(j => { pricey[5 + j] = rich[j]; pricey[1 + j] = richD[j]; });
  pricey[9] = richF[0]; pricey[10] = richF[1];
  check(/over budget|from one club/.test(tryTeam(pricey)), 'an over-budget squad is refused');
  const r1 = save(team(order))[0].r;
  check(r1.bank === R.budget - squad.reduce((a, p) => a + p.price, 0) && r1.transfers === 0, `the first squad is free and costs its prices (bank ${r1.bank})`);
  check((sql(`select count(*)::int n from public.sf_my_team where entry_id = ${entry}`, { role: 'authenticated', user: ADMIN }) as { n: number }[])[0].n === N, 'the owner sees the squad');
  check((sql(`select count(*)::int n from sf.entry_picks`, { role: 'authenticated', user: USER }) as { n: number }[])[0].n === 0, 'another user sees no current picks');

  // 1. the season through the database, step by step
  for (let k = 0; k < 12; k++) {
    if (await advance(d, universe, { force: true, lineup }) === 'season over') break;
    const state = (sql(`select number, state from sf.rounds where season_id = ${season} and state in ('open') order by number limit 1`) as { number: number }[])[0];
    // after round 1, the manager makes two transfers in round 2 (one free, one −4)
    if (state?.number === 2) {
      const mids = players.filter(p => p.position === 'MID' && !squad.includes(p) && (perClub[p.club_id] ?? 0) < 2).slice(0, 2);
      const o2 = order.slice(); o2[5] = mids[0]; o2[6] = mids[1];
      const r2 = save(team(o2))[0].r;
      check(r2.transfers === 2 && r2.hits_if_deadline_now === 4, `two transfers with one free cost 4 points (${r2.transfers}, ${r2.hits_if_deadline_now})`);
    }
  }
  const mem = runLeague(seed, lineup, solve, { universe, botPrefix: `${universe}|`, rules: R });
  const db = sql(`select m.bot_key, sum(s.total)::int total from sf.entries e join sf.fantasy_managers m on m.id = e.manager_id
    join sf.entry_round_scores s on s.entry_id = e.id where e.season_id = ${season} and m.is_bot group by m.bot_key`) as { bot_key: string; total: number }[];
  const dbTotal = Object.fromEntries(db.map(x => [x.bot_key, x.total]));
  const mismatches = mem.bots.filter(b => dbTotal[b.id] !== b.total);
  check(mismatches.length === 0, `all ${mem.bots.length} bots score the same through the database as in memory${mismatches.length ? `: ${mismatches.map(b => `${b.id} ${b.total} v ${dbTotal[b.id]}`).join(', ')}` : ''}`);
  const hits = (sql(`select hits from sf.entry_round_snapshots where entry_id = ${entry} and round = 2`) as { hits: number }[])[0]?.hits;
  check(hits === 4, `the manager's round-2 hit was charged at the deadline (${hits})`);
  const ft = (sql(`select free_transfers from sf.entries where id = ${entry}`) as { free_transfers: number }[])[0].free_transfers;
  check(ft === 3, `unused free transfers banked to 3 by the end (${ft})`);
  const counts = (sql(`select (select count(*) from sf.match_results r join sf.fixtures f on f.id = r.fixture_id where f.season_id = ${season})::int results,
    (select count(*) from sf.rounds where season_id = ${season} and state = 'final')::int rounds, (select state from sf.seasons where id = ${season}) state,
    (select shield_winner from sf.seasons where id = ${season}) shield`) as { results: number; rounds: number; state: string; shield: string }[])[0];
  check(counts.results === 50 && counts.rounds === 10 && counts.state === 'done' && !!counts.shield, `50 results, 10 final rounds, season done, Shield to ${counts.shield}`);
  const st = (sql(`select count(*)::int n, count(*) filter (where started)::int starters from sf.player_match_stats x join sf.fixtures f on f.id = x.fixture_id where f.season_id = ${season}`) as { n: number; starters: number }[])[0];
  check(st.starters === 50 * 22 && st.n > st.starters, `player stats for every starter and sub (${st.n} rows)`);

  // 2. idempotency and immutability
  check((await rpc('sf_lock_round', { p_season: season, p_round: 10, p_force: true })) === 'noop', 'locking a final round again is a no-op');
  const fakeCommit = { season_id: season, round: 10, results: [] };
  check((await rpc('sf_commit_round', { p: fakeCommit })) === 'noop', 'committing a final round again is a no-op');
  check(/immutable/.test(exec(`update sf.match_results set home_goals = home_goals + 1 where fixture_id = (select min(fixture_id) from sf.match_results)`, { role: 'service_role' }) ?? ''), 'a final result refuses an update, even from the service role');
  check(/immutable/.test(exec(`delete from sf.match_events where fixture_id = (select min(fixture_id) from sf.match_events)`, { role: 'service_role' }) ?? ''), 'final events refuse a delete');
  check(/immutable/.test(exec(`update sf.entry_round_scores set points = points + 1, total = total + 1 where entry_id = ${entry}`, { role: 'service_role' }) ?? ''), 'a final score refuses an update');
  check(/deadline|locked|season/.test(sqlError(`select public.sf_save_team(${season}, '${team(order)}'::jsonb)`, { role: 'authenticated', user: ADMIN }) ?? ''), 'no changes once the season is over');

  // 3. visibility
  for (const [who, as] of [['anon', { role: 'anon' }], ['a non-admin', { role: 'authenticated', user: USER }]] as const) {
    for (const v of ['sf_seasons', 'sf_players', 'sf_fixtures', 'sf_match_events', 'sf_leaderboard', 'sf_league_table', 'sf_projections', 'sf_entry_rounds'])
      check((sql(`select count(*)::int n from public.${v}`, as) as { n: number }[])[0].n === 0, `${who} sees nothing in ${v} while the universe is not public`);
  }
  for (const t of ['worlds', 'player_hidden', 'engine_snapshots', 'sim_runs', 'corrections'])
    for (const role of ['anon', 'authenticated'])
      check(/permission denied/.test(sqlError(`select 1 from sf.${t} limit 1`, { role, user: ADMIN }) ?? ''), `${role} (even an admin) cannot read sf.${t}`);
  for (const f of ['sf_create_season(\'{}\'::jsonb)', `sf_lock_round(${season}, 1, true)`, 'sf_runner_state(\'check\')', `sf_bot_save_team(1, '{}'::jsonb)`])
    check(/permission denied/.test(sqlError(`select public.${f}`, { role: 'authenticated', user: ADMIN }) ?? ''), `authenticated cannot run ${f.split('(')[0]}`);
  const lb = sql(`select count(*)::int n, max(total) top from public.sf_leaderboard where season_id = ${season}`, { role: 'authenticated', user: ADMIN }) as { n: number; top: number }[];
  check(lb[0].n === 25, `an admin sees the leaderboard: ${lb[0].n} entries, top ${lb[0].top}`);
  const tbl = sql(`select sum(p)::int p, sum(pts)::int pts from public.sf_league_table where season_id = ${season}`, { role: 'authenticated', user: ADMIN }) as { p: number; pts: number }[];
  check(tbl[0].p === 90, `the league table has 90 appearances (45 league matches), ${tbl[0].pts} points`);
  exec(`update sf.universes set is_public = true where id = '${universe}'`);
  check((sql(`select count(*)::int n from public.sf_players`, { role: 'anon' }) as { n: number }[])[0].n === 150, 'once public, anon sees the players');
  check((sql(`select count(*)::int n from public.sf_my_team`, { role: 'authenticated', user: USER }) as { n: number }[])[0].n === 0, 'a user without an entry has no team');
  exec(`update sf.universes set is_public = false where id = '${universe}'`);

  // 5. test leagues driven by an admin through sf_test_rpc (migration 20261010210000)
  const testRpc = (as: { role: string; user?: string }): Rpc => async (fn, args) => {
    const b = Buffer.from(JSON.stringify(args)).toString('base64');
    const rows = sql(`select public.sf_test_rpc('${fn}', convert_from(decode('${b}', 'base64'), 'UTF8')::jsonb) r`, as) as { r: unknown }[];
    return rows[0].r;
  };
  const adminD = { rpc: testRpc({ role: 'authenticated', user: ADMIN }), hash: d.hash, solve };
  const tSeason = await createSeason(adminD, { universe: 't-check', name: 'T', seed: 't-check-1', firstDeadline: new Date(Date.now() + 7 * 86400_000), spacingMinutes: 10080, kickoffAfterMinutes: 180, zone: 'Europe/London', rules: R });
  check(tSeason > 0, 'an admin creates a test league');
  check((sql(`select is_test from sf.universes where id = 't-check'`) as { is_test: boolean }[])[0].is_test, 'it is flagged as a test league');
  check(await advance(adminD, 't-check', { force: true, lineup: { optimiser: 1, random: 2 } }) === 'ok', 'the admin plays round 1 at once (bots, early lock, play)');
  check((sql(`select state from sf.rounds where season_id = ${tSeason} and number = 1`) as { state: string }[])[0].state === 'final', 'round 1 is final');
  check((sql(`select count(*)::int n from public.sf_fixtures where season_id = ${tSeason} and round = 1 and status = 'full_time'`, { role: 'authenticated', user: ADMIN }) as { n: number }[])[0].n === 5, 'its results show straight away');
  const refused = async (rpcFn: Rpc, fn: string, args: Record<string, unknown>) => { try { await rpcFn(fn, args); return ''; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } };
  check(/admins only/.test(await refused(testRpc({ role: 'authenticated', user: USER }), 'sf_runner_state', { p_universe: 't-check' })), 'a non-admin cannot use the test controls');
  check(/permission denied/.test(await refused(testRpc({ role: 'anon' }), 'sf_runner_state', { p_universe: 't-check' })), 'anon cannot call sf_test_rpc');
  check(/not a test league/.test(await refused(adminD.rpc, 'sf_runner_state', { p_universe: universe })), 'the test controls refuse a league that is not a test league');
  check(/not a test league/.test(await refused(adminD.rpc, 'sf_lock_round', { p_season: season, p_round: 1, p_force: true })), 'and refuse to lock one of its rounds');
  check(/starts t-/.test(await refused(adminD.rpc, 'sf_create_season', { p: { universe: { id: 'real-one' } } })), 'a new test league must be named t-…');
  check(/not allowed/.test(await refused(adminD.rpc, 'sf_save_team', {})), 'only the runner functions go through the test controls');
  check(/violates check constraint/.test(exec(`update sf.universes set is_public = true where id = 't-check'`) ?? ''), 'a test league can never be made public');

  console.log(failures ? `${failures} FAILED` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });

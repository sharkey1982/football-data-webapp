/* ===========================================================================
   games/beat-the-shark/test/checks.cjs

   Run:  node games/beat-the-shark/test/checks.cjs

   Every change to the game should pass these before it ships. They exist
   because the game is one large file where prose and logic are interleaved,
   so a wording tweak can break the engine -- and a tuning tweak can quietly
   change what the game teaches. These catch both.

   Exit code 0 = all passed. Non-zero = something failed; CI blocks the push.

   Checks are in three groups:
     1. INTEGRITY  every event, in every role, renders without undefined/NaN
                   or "[object" text, and never throws
     2. STABILITY  hundreds of full seasons play start to finish without a
                   crash, under the best, worst and no-decision policies
     3. BALANCE    the numbers the design depends on stay in range

   Balance targets are deliberately ranges, not exact values: seasons are
   random, and a check that fails on sampling noise gets ignored. Ranges
   were set from 2,500-season runs; see the README for how.
   =========================================================================== */
let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

/* ---------------------------------------------------------------- 0 ---- */
/* The game is split across several <script src> files. A browser runs each
   one separately, in order -- so if early top-level code needs something a
   LATER file defines, the page breaks on load. The season simulator joins
   the files into one block, which would hide exactly that bug, so this
   check loads them the way a browser does instead. */
console.log('\n0. LOADING — files load in order, as a browser runs them');
{
  const vm = require('vm'), fs = require('fs'), path = require('path');
  const file = process.env.GAME || path.join(__dirname, '..', 'index.html');
  const dir = path.dirname(file), html = fs.readFileSync(file, 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  if (!srcs.length) check('split files load in order', true, 'single-file build, not applicable');
  else {
    const el = () => ({ innerHTML: '', textContent: '', onclick: null, style: {}, dataset: {},
      appendChild() {}, classList: { add() {} }, querySelectorAll: () => [] });
    const ctx = vm.createContext({ document: { getElementById: el, querySelectorAll: () => [], createElement: el },
      setTimeout: () => {}, Math, JSON, Object, Array, String, Number, Date, Map, Set, console, location: { hash: '' } });
    let failed = '';
    for (const s of srcs) {
      try { new vm.Script(fs.readFileSync(path.join(dir, s), 'utf8'), { filename: s }).runInContext(ctx); }
      catch (e) { failed = `${s}: ${e.message}`; break; }
    }
    check(`all ${srcs.length} script files load in order without error`, !failed, failed || srcs.join(' → '));
  }
}

/* The simulator is loaded only AFTER the load check, and only if it passed.
   Loaded first, a broken build crashed with a raw stack trace before check
   0 could explain what was wrong. */
if (failures) {
  console.log('\nThe game does not load, so the remaining checks were skipped.');
  console.log('Fix the script order or the file named above, then run again.');
  process.exit(1);
}
const { G, season, beginnerSeason } = require('./season_sim.cjs');

/* ---------------------------------------------------------------- 1 ---- */
console.log('\n1. INTEGRITY — every event renders cleanly');
{
  G.setSeed('CHECK'); G.pickRivals(); G.buildFixtures(); G.setTable(G.blankTable());
  G.setPredict(G.monteCarlo(300));
  let rendered = 0, broken = 0, threw = 0, firstBad = '';
  for (const role of ['owner', 'manager', 'player']) {
    G.setRole(G.ROLES[role]); G.setS(G.newState()); G.recalcSquadRating();
    const builders = [
      ...G.ROLES[role].pool.map((k) => () => G.SHAPES[k]()),
      () => { G.getS().flags = {}; return G.presserSpec(); },
      () => G.callSpec(),
      () => G.physioSpec(),
    ];
    for (const build of builders) {
      for (let i = 0; i < 25; i++) {
        try {
          const e = build(); rendered++;
          const text = JSON.stringify([e.title, e.lede, e.body || '',
            (e.choices || []).map((c) => [c.t, c.d || '', c.out || '', c.delayedText || ''])]);
          if (/undefined|NaN|\[object/.test(text)) { broken++; if (!firstBad) firstBad = text.slice(0, 120); }
        } catch (err) { threw++; if (!firstBad) firstBad = String(err.message || err); }
      }
    }
  }
  check('no event text contains undefined/NaN/[object', broken === 0, `${broken} of ${rendered}${firstBad ? ' — ' + firstBad : ''}`);

  /* The pitch view and bench, in every formation, read-only and in pick
     mode, including a keeper crisis and an injury-hit squad. */
  let pitchBad = '', pitches = 0;
  for (const role of ['owner', 'manager', 'player']) {
    for (const fm of Object.keys(G.FORMATIONS)) {
      G.setRole(G.ROLES[role]); G.setS(G.newState()); G.recalcSquadRating();
      const S = G.getS(); S.formation = fm;
      const variants = [() => {}, () => { S.squadList.filter((p) => p.pos === 'GK').forEach((p) => (p.out = 2)); },
                        () => { S.squadList.slice(0, 6).forEach((p) => (p.out = 1)); }];
      for (const v of variants) {
        v();
        for (const opts of [{}, { pick: true, sel: 0 }]) {
          try {
            const html = G.squadHTML(opts); pitches++;
            const starters = (html.match(/class="pm/g) || []).length;
            /* Eleven -- or everyone available, if injuries leave fewer. */
            const want = Math.min(11, S.squadList.filter((p) => !p.gone && !p.out).length);
            if (/undefined|NaN|\[object/.test(html)) pitchBad = pitchBad || `${role}/${fm}: bad text`;
            else if (starters !== want) pitchBad = pitchBad || `${role}/${fm}: ${starters} on the pitch, expected ${want}`;
          } catch (e) { pitchBad = pitchBad || `${role}/${fm}: ${e.message}`; }
        }
      }
    }
  }
  check('pitch view fields a full side cleanly in every formation and crisis', !pitchBad, pitchBad || `${pitches} renders`);
  check('no event throws while being built', threw === 0, `${threw} of ${rendered}`);
}

/* ---------------------------------------------------------------- 1b --- */
/* ONE CONSISTENT VIEW. This inconsistency surfaced twice in playtesting --
   a club shown stronger but projected lower. Every table is now ordered by
   points won plus expected points for the games left; this plays seasons to
   three points and confirms no table can contradict its own columns. */
console.log('\n1b. CONSISTENCY — tables never contradict their own numbers');
{
  let bad = 0, n = 0;
  for (let k = 1; k <= 30; k++) {
    G.setSeed('CONS' + k); G.pickRivals(); G.buildFixtures(); G.setTable(G.blankTable());
    G.setRole(G.ROLES.manager); const S = G.newState(); G.setS(S); G.recalcSquadRating();
    const teams = ['Your Team', ...G.getRivals().map((r) => r.n)];
    const test = () => { const RL = G.ratingsNow(S.mw), E = G.expectedFinal(RL), o = G.projOrder(teams, null, RL);
      for (let i = 0; i < o.length - 1; i++) { n++; if (E[o[i + 1]] > E[o[i]] + 1e-9) bad++; } };
    const play = (w) => { const f = G.myFixture(w); const [hg, ag] = G.playFixture(f[0], f[1], true); G.award(G.T(), f[0], f[1], hg, ag);
      G.otherFixtures(w).forEach(([h, a]) => { const [x, y] = G.simScore(G.strOf(h), G.strOf(a)); G.award(G.T(), h, a, x, y); });
      G.resolveMine(hg, ag, f[0] === 'Your Team'); S.mw++; };
    test(); for (let w = 0; w < 5; w++) play(w); const L = G.drawLuck(); if (L) L.apply(); test();
    for (let w = 5; w < 8; w++) play(w); test();
  }
  check('no table lists a club above one with more projected points', bad === 0, `${bad} of ${n} pairs, pre-season / halfway / GW8`);
}

/* ---------------------------------------------------------------- 1c --- */
/* POSITION SCORING AND MONEY WITH CONSEQUENCES (2026-09-21). The verdict is
   finishing position against the Shark's predicted place for a well-run club;
   in the red the bank forces sales, deep in the red costs 3 points. */
console.log('\n1c. POSITION SCORING + MONEY CONSEQUENCES');
{
  const orig = G.cashConsequences; let ev = [];
  G.cashConsequences = function () { const r = orig.apply(this, arguments); ev.push(...r); return r; };
  const run = (role, pol, n) => { let beat = 0, level = 0, sale = 0;
    for (let i = 1; i <= n; i++) { ev = []; const pos = season(`POS-${role}-${pol}-${i}`, role, pol, true); const t = G.sharkPos();
      if (pos < t) beat++; else if (pos === t) level++; if (ev.some((e) => e.type === 'sale')) sale++; }
    return { beat: beat / n * 100, level: level / n * 100, sale: sale / n * 100 }; };
  const good = run('manager', 'best', 250), careless = run('manager', 'none', 250), worst = run('manager', 'worst', 250), rand = run('manager', 'random', 250);
  G.cashConsequences = orig;
  check('competent manager matches or beats the Shark\'s position most seasons (>= 65%)', good.beat + good.level >= 65, `beat ${good.beat.toFixed(0)}%, level ${good.level.toFixed(0)}%`);
  check('careless manager rarely beats it (<= 15%)', careless.beat <= 15, `${careless.beat.toFixed(0)}%`);
  check('worst decisions almost never beat it (<= 5%)', worst.beat <= 5, `${worst.beat.toFixed(0)}%`);
  check('money matters: a careful (money-aware) manager almost never faces a forced sale (<= 5%)', good.sale <= 5, `${good.sale.toFixed(0)}% of seasons`);
  // The "worst" style no longer overspends -- the pre-season offer lets it SELL
  // its best player, which fills the bank -- so reckless = random clicking.
  check('money matters: reckless spending brings forced sales (random >= 5% of seasons)', rand.sale >= 5, `random ${rand.sale.toFixed(0)}%, worst ${worst.sale.toFixed(0)}%`);
}

/* ---------------------------------------------------------------- 2 ---- */
console.log('\n2. STABILITY — full seasons play without crashing');
{
  let played = 0, crashed = 0, firstErr = '';
  for (const role of ['owner', 'manager', 'player']) {
    for (const pol of ['worst', 'none', 'best']) {
      for (let i = 1; i <= 60; i++) {
        try { season(`STAB-${role}-${pol}-${i}`, role, pol); played++; }
        catch (err) { crashed++; if (!firstErr) firstErr = `${role}/${pol}: ${err.message}`; }
      }
    }
  }
  check('540 seasons complete with no crash', crashed === 0, `${crashed} crashed${firstErr ? ' — ' + firstErr : ''}`);
}

/* ---------------------------------------------------------------- 3 ---- */
console.log('\n3. BALANCE — the design targets still hold');
{
  /* The Shark predicts from a fresh pre-season squad with no decisions
     made -- the same thing the game does at the start of every season. */
  G.setSeed('BAL'); G.pickRivals(); G.buildFixtures(); G.setTable(G.blankTable());
  G.setRole(G.ROLES.manager); G.setS(G.newState()); G.recalcSquadRating();
  const P = G.monteCarlo(4000); G.setPredict(P);
  const pred = Math.round(P['Your Team'].avg);
  const fav = Object.values(P).reduce((a, b) => (b.title > a.title ? b : a));

  /* The favourite should USUALLY win the title, but not always. That gap is
     the probability lesson. At ~48% it was a coin flip and taught nothing. */
  // Recalibrated 2026-09-21 for Chris's new aim -- WIN THE LEAGUE, from a predicted 3rd
  // that is close to the top (top two clubs 70/62, were 78/64).
  check('favourite wins the title 50–75% of simulated seasons', fav.title >= 50 && fav.title <= 75, `${fav.title}%`);

  const N = 700;
  const sharkPts = P['Your Team'].pts;
  /* Scored in POINTS against a Shark that predicts a well-run club. */
  const run = (role, pol) => {
    let title = 0, beat = 0;
    for (let i = 1; i <= N; i++) {
      const pos = season(`BAL-${role}-${pol}-${i}`, role, pol);
      if (pos === 1) title++;
      if (G.T()['Your Team'].pts > sharkPts) beat++;
    }
    return { title: (title / N) * 100, beat: (beat / N) * 100 };
  };
  const mBest = run('manager', 'best'), mNone = run('manager', 'none'), mExp = run('manager', 'expert'), oBest = run('owner', 'best');

  /* A well-played manager wins the league roughly 10-15% of the time. */
  // Recalibrated 2026-09-21 for Chris's new aim -- WIN THE LEAGUE, from a predicted 3rd
  // that is close to the top (top two clubs 70/62, were 78/64).
  check('well-played manager wins the title 10–22%', mBest.title >= 10 && mBest.title <= 22, `${mBest.title.toFixed(1)}%`);

  /* THE DIFFICULTY SETTING (SHARK_UPLIFT). A competent manager should beat
     the Shark about 6 times in 10 -- beatable but earned -- and a careless
     one only 2-3 times in 10. If this drifts, the Shark has become either
     naive or unbeatable. */
  check('competent manager beats the Shark 50–70% of seasons', mBest.beat >= 50 && mBest.beat <= 70, `${mBest.beat.toFixed(0)}%`);
  check('careless manager beats the Shark only 8–22% of seasons', mNone.beat >= 8 && mNone.beat <= 22, `${mNone.beat.toFixed(0)}%`);

  /* Using every team-sheet lever should help, but not break the game: an
     expert who hand-picks lineups and out-of-position players must not be
     far ahead of a sensible manager. This is the check that was missing
     when the game became too easy. */
  check('expert lineup play helps without breaking the game (within +12 of competent)',
    mExp.beat >= mBest.beat - 3 && mExp.beat <= mBest.beat + 12, `expert ${mExp.beat.toFixed(0)}% vs competent ${mBest.beat.toFixed(0)}%`);

  /* Winning the league WITHOUT making the right decisions must be very
     remote. Rare events need a big sample, so this one runs 1,500 seasons
     each for a manager who decides nothing and one who clicks at random. */
  const titleRate = (pol) => { let t = 0; const M = 1500;
    for (let i = 1; i <= M; i++) if (season(`RARE-${pol}-${i}`, 'manager', pol) === 1) t++;
    return (t / M) * 100; };
  const tNone = titleRate('none'), tRand = titleRate('random');
  // Recalibrated 2026-09-21 for Chris's new aim -- WIN THE LEAGUE, from a predicted 3rd
  // that is close to the top (top two clubs 70/62, were 78/64).
  check('careless manager wins the league rarely (≤4%)', tNone <= 4, `${tNone.toFixed(2)}% — about 1 season in ${tNone ? Math.round(100 / tNone) : '∞'}`);
  check('random-clicking manager wins the league rarely (≤4%)', tRand <= 4, `${tRand.toFixed(2)}%`);

  /* The manager is meant to be the most powerful chair. */
  check('manager is the most influential role', mBest.beat > oBest.beat, `manager ${mBest.beat.toFixed(0)}% vs owner ${oBest.beat.toFixed(0)}% beat the Shark`);
}

/* ------------------------------------------------------------- 1d (last) */
/* Runs LAST: it leaves a five-game fixture list behind. */
/* THE BEGINNER SEASON (agreed 2026-09-21): five games, neutral venues,
   weekly wages, Shark Scout boosted. Policies are compared on the SAME
   seasons -- different seeds per policy once made "best" look worse than
   doing nothing, which was noise. */
console.log('\n1d. BEGINNER SEASON (five games)');
{
  const N = 400; const agg = {};
  for (const pol of ['best', 'none', 'worst']) { let sum = 0, mine = 0, sharks = 0;
    let top2 = 0;
    for (let i = 1; i <= N; i++) { const r = beginnerSeason(`CHK-B-${i}`, pol); sum += r.pos; if (r.pos === 1) mine++; if (r.pos <= 2) top2++; if (r.champ === 'Shark Scout United') sharks++; }
    agg[pol] = { avg: sum / N, title: mine / N * 100, top2: top2 / N * 100, sharks: sharks / N * 100 }; }
  let third = 0; for (let i = 1; i <= 40; i++) { beginnerSeason(`CHK-B3-${i}`, 'none', true); if (G.sharkPos() === 3) third++; }
  check('Shark Scout United win the league most of the time (55-80%)', agg.none.sharks >= 55 && agg.none.sharks <= 80, `${agg.none.sharks.toFixed(0)}%`);
  check('the Shark predicts 3rd (at least 38 of 40 seasons)', third >= 38, `${third}/40`);
  check('decisions matter: best finishes higher on average than none, and none than worst', agg.best.avg < agg.none.avg && agg.none.avg < agg.worst.avg, `${agg.best.avg.toFixed(2)} / ${agg.none.avg.toFixed(2)} / ${agg.worst.avg.toFixed(2)}`);
  // TOP-TWO finishes, not titles: at 400 seasons titles are ~20-25 events, too
  // few to separate the policies (2026-09-22: best 5.0% v none 6.0% at 400;
  // over 1,500 the true order was best 6.4% > none 4.6% > worst 3.7%, top two
  // 24.7% v 18.1%). Top-two finishes are frequent enough to be stable here.
  check('good decisions reach the top two more often than none', agg.best.top2 > agg.none.top2, `best ${agg.best.top2.toFixed(1)}%, none ${agg.none.top2.toFixed(1)}%`);
  check('a title stays rare, even with good decisions (under 15%)', agg.best.title < 15, `best ${agg.best.title.toFixed(1)}%`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

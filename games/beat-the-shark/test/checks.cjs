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
const { G, season } = require('./season_sim.cjs');

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

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
  check('no event throws while being built', threw === 0, `${threw} of ${rendered}`);
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
  G.setSeed('BAL'); G.pickRivals(); G.buildFixtures(); G.setTable(G.blankTable());
  const P = G.monteCarlo(4000); G.setPredict(P);
  const pred = Math.round(P['Your Team'].avg);
  const fav = Object.values(P).reduce((a, b) => (b.title > a.title ? b : a));

  /* The favourite should USUALLY win the title, but not always. That gap is
     the probability lesson. At ~48% it was a coin flip and taught nothing. */
  check('favourite wins the title 65–85% of simulated seasons', fav.title >= 65 && fav.title <= 85, `${fav.title}%`);

  const N = 800;
  const run = (role, pol) => {
    let title = 0, beat = 0, score = 0;
    for (let i = 1; i <= N; i++) {
      const pos = season(`BAL-${role}-${pol}-${i}`, role, pol);
      if (pos === 1) title++;
      if (pos < pred) beat++;
      score += Math.max(0, Math.min(100, 50 + (pred - pos) * 15 + (pos === 1 ? 15 : 0)));
    }
    return { title: (title / N) * 100, beat: (beat / N) * 100, score: score / N };
  };
  const mBest = run('manager', 'best'), mNone = run('manager', 'none'), oBest = run('owner', 'best');

  /* A well-played manager wins the league roughly 10-15% of the time. The
     range is wider than that because 800 seasons carries about +/-2%
     sampling noise on a rate this size. */
  check('well-played manager wins the title 7–17%', mBest.title >= 7 && mBest.title <= 17, `${mBest.title.toFixed(1)}%`);

  /* No decisions should score about 50: the Shark's prediction is what a
     club that decides nothing achieves. If this drifts, the score stops
     meaning "what your decisions were worth". */
  check('no-decision play scores 44–57 (the Shark is the no-decision baseline)', mNone.score >= 44 && mNone.score <= 57, `${mNone.score.toFixed(1)}`);

  /* Decisions must matter, or it is a slideshow. */
  check('good management beats the Shark far more often than none', mBest.beat - mNone.beat >= 20, `${mBest.beat.toFixed(0)}% vs ${mNone.beat.toFixed(0)}%`);

  /* The manager is meant to be the most powerful chair: the audience is
     fantasy-football players who want to manage. */
  check('manager is the most influential role', mBest.title > oBest.title, `manager ${mBest.title.toFixed(1)}% vs owner ${oBest.title.toFixed(1)}%`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

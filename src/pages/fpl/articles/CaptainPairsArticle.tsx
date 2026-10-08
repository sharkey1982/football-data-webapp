// ============================================================================
// src/pages/fpl/articles/CaptainPairsArticle.tsx
//
// /fpl/articles/one-captain-or-two -- "One captain or two? The mathematics
// of FPL captaincy" (Chris, 8 Oct 2026). Part one is evergreen method; part
// two is a dated case study on the projections of 8 Oct 2026 (GW6-15).
// Figures: src/lib/fplArticleCaptainPairs.ts (scripts/analysis_captain_partnerships.ts).
// ============================================================================

import { Link } from 'react-router-dom';
import ArticleLayout, { DataTable, H2, LINK, PROSE, StatRow } from '../../../components/articles/ArticleLayout';
import CaptainGrid from '../../../components/articles/CaptainGrid';
import DeltaBarChart from '../../../components/articles/DeltaBarChart';
import LineChart, { ChartLegend } from '../../../components/history/LineChart';
import { CAPTAIN_ARTICLE, CAPTAIN_PAIRS_ARTICLE, HAALAND_ARTICLE } from '../../../lib/fplArticles';
import {
  BUDGET_CURVE,
  CANDIDATES,
  CASE_STUDY,
  COMBOS,
  GWS,
  LOW_EVIDENCE_COUNT,
  LOW_EVIDENCE_EXAMPLES,
  PARTNERS,
  PLAYER_COLOUR,
  SQUADS,
} from '../../../lib/fplArticleCaptainPairs';

const H3 = 'font-display uppercase tracking-wide text-base text-ink-900';
const CODE = 'block font-mono text-sm bg-chalk-100 border border-chalk-300 rounded px-3 py-2 overflow-x-auto';

// Literal class names so Tailwind generates them.
const STROKE: Record<string, string> = {
  Haaland: 'stroke-[#2a7a4f]', Saka: 'stroke-[#c08a1e]', Bruno: 'stroke-[#3567a8]', Palmer: 'stroke-[#b23a48]', Optimal: 'stroke-ink-700',
};
// LineChart derives dot fills by swapping stroke- for fill-; listed here so
// Tailwind generates them: fill-[#2a7a4f] fill-[#c08a1e] fill-[#3567a8] fill-[#b23a48] fill-ink-700
const SWATCH: Record<string, string> = {
  Haaland: 'bg-[#2a7a4f]', Saka: 'bg-[#c08a1e]', Bruno: 'bg-[#3567a8]', Palmer: 'bg-[#b23a48]', Optimal: 'bg-ink-700',
};
const GRID_COLOUR = (n: string) => PLAYER_COLOUR[n] ?? '#8a8f94';
const SHORT = (n: string) => (n === 'Calvert-Lewin' ? 'C-Lewin' : n === 'Tavernier' ? 'Tavern.' : n);
const signed = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v < 0 ? `−${Math.abs(v).toFixed(1)}` : '0.0');

function cumulative(path: [string, number][], base: [string, number][]) {
  let t = 0;
  return path.map(([, v], i) => {
    t += v - base[i][1];
    return { x: GWS[i], y: +t.toFixed(2) };
  });
}

export default function CaptainPairsArticle() {
  const [haaland, saka] = CANDIDATES;
  const combo = (k: string) => COMBOS.find((c) => c.key === k)!;
  const alone = combo('h'), hs = combo('hs'), hb = combo('hb'), hp = combo('hp'), hsb = combo('hsb'), opt = combo('opt');
  const free = SQUADS[0];
  const sq = (k: string) => SQUADS.find((s) => s.key === k)!;
  const vs = (k: string) => {
    const s = sq(k);
    const total = +(s.total - free.total).toFixed(2);
    const ordinary = +(s.xi - free.xi).toFixed(2);
    const captaincy = Math.abs(total - ordinary) < 0.05 ? 0 : +(total - ordinary).toFixed(2);
    return { total, ordinary, captaincy };
  };
  const sakaGaps = GWS.map((g, i) => ({ g, gap: saka.xp[i] - haaland.xp[i] })).filter((x) => x.gap > 0);
  const perMillion = (BUDGET_CURVE[4].total - BUDGET_CURVE[0].total) / 10;
  const ppm = (xp: number, price: number) => (xp / price).toFixed(1);

  return (
    <ArticleLayout
      meta={CAPTAIN_PAIRS_ARTICLE}
      next={[
        { label: 'Player Projections: this week’s expected points for every player', to: '/fpl/player-points' },
        { label: 'Optimiser: the best squad under budget, with forced picks', to: '/fpl/optimal-squad' },
        { label: CAPTAIN_ARTICLE.title, to: CAPTAIN_ARTICLE.path },
        { label: HAALAND_ARTICLE.title, to: HAALAND_ARTICLE.path },
        { label: 'Starting Lineups and Minutes Outlook: the playing-time inputs', to: '/fpl/line-ups' },
      ]}
      method={
        <>
          <p>
            <strong>Projections.</strong> FixtureShark&rsquo;s player projections (model {CASE_STUDY.modelVersion}, baseline scenario) for gameweeks {CASE_STUDY.fromGw} to {CASE_STUDY.toGw} of {CASE_STUDY.season}, generated {CASE_STUDY.projectedAt}, with that day&rsquo;s FPL prices. They are read through the same feed the <Link to="/fpl/optimal-squad" className={LINK}>Optimiser</Link> uses: 6,670 rows, one per player per gameweek (667 players, no blank or double gameweeks in the range).
          </p>
          <p>
            <strong>Checks before use.</strong> Player identities by FPL id (two players are called Palmer: Chelsea&rsquo;s midfielder and a goalkeeper); one projection per player and fixture at the current model version (older-version rows for gameweeks 6 to 10 are ignored); prices and availability against FPL&rsquo;s current data; start probabilities against minutes played this season. That last check found {LOW_EVIDENCE_COUNT} players with under 200 minutes but a projected start probability of 0.6 or more, for example {LOW_EVIDENCE_EXAMPLES}. Every squad below was solved with and without them: no optimal squad picked any of them, and every total was identical. The model was not changed.
          </p>
          <p>
            <strong>Squads.</strong> An exact integer programme (the same formulation as the site&rsquo;s exact optimiser, solved with HiGHS, proven optimal): one 15-man squad for all ten gameweeks, &pound;100m, 2&ndash;5&ndash;5&ndash;3, at most three per club, the best legal XI and captain chosen each week. Bench players score only if they start. No transfers are modelled. One solve, &ldquo;no Haaland&rdquo; with every player, exhausted the solver&rsquo;s memory; it is reported from the solve without the {LOW_EVIDENCE_COUNT} low-evidence players, which made no difference in every case that did solve both ways.
          </p>
          <p>
            Code: <code className="font-mono text-xs">scripts/analysis_captain_partnerships.ts</code>, run 8 Oct 2026. The figures here are frozen; the projections themselves refresh daily.
          </p>
        </>
      }
    >
      <StatRow
        stats={[
          { value: '+3.6', label: 'captain points from adding Saka to Haaland, GW6–15' },
          { value: '1 of 5', label: 'Saka armband weeks clear by more than a point' },
          { value: '−0.9', label: 'squad points from forcing Bruno in as a third option' },
          { value: '−20.6', label: 'squad points with no £9m+ player beside Haaland' },
        ]}
      />

      <div className={PROSE}>
        <p>
          A common piece of FPL advice is to own two strong captaincy options, so that one covers the other&rsquo;s bad fixtures. It sounds sensible, and it is half right. This article works through the maths, then tests it on FixtureShark&rsquo;s projections for the next ten gameweeks with a solver that builds the best possible squad under the real rules.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      <h2 className="font-display uppercase tracking-wide text-xl text-pitch-800 border-b border-chalk-300 pb-1">Part one: the maths</h2>

      <section aria-labelledby="armband-heading" className="space-y-3">
        <h2 id="armband-heading" className={H2}>What the armband is worth</h2>
        <div className={PROSE}>
          <p>
            The captain scores double. Counted carefully, the armband adds <em>one extra copy</em> of the captain&rsquo;s points; his first copy is already in your XI total. So a squad&rsquo;s expected points in a gameweek are
          </p>
          <code className={CODE}>squad points = XI points + captain&rsquo;s points</code>
          <p>
            and the only thing a captaincy choice changes is the second term. If Haaland is projected for 7 points, captaining him is worth 7 extra points, not 14. Counting 14 double-counts the 7 he scores anyway.
          </p>
        </div>
      </section>

      <section aria-labelledby="rotation-heading" className="space-y-3">
        <h2 id="rotation-heading" className={H2}>The rotation gain</h2>
        <div className={PROSE}>
          <p>Own one captain, A, and you captain him every week. Own a second, B, and each week you captain whichever is projected higher. Over gameweeks <em>t</em>, the extra captain points from owning B are</p>
          <code className={CODE}>rotation gain = &Sigma;<sub>t</sub> max(A<sub>t</sub>, B<sub>t</sub>) &minus; &Sigma;<sub>t</sub> A<sub>t</sub></code>
          <p>
            Two things follow. The gain can never be negative, so a second option never hurts your captaincy. And B only earns anything in weeks he is projected above A, and then only by the margin. A player who is slightly worse than A every week adds nothing, however good he is.
          </p>
          <p>
            With three or more options the formula is the same, with the maximum taken over all of them. Each extra option only counts in weeks it beats every other option you already own, so the gains shrink quickly.
          </p>
        </div>
      </section>

      <section aria-labelledby="fixtures-heading" className="space-y-3">
        <h2 id="fixtures-heading" className={H2}>Why the fixtures matter more than the totals</h2>
        <div className={PROSE}>
          <p>
            Because only the weeks where B is ahead count, the best partner is not the player with the second-highest ten-week total. It is the one whose good weeks fall in A&rsquo;s weak ones. Over gameweeks 6 to 15, Bruno is projected for {PARTNERS[3].xp10.toFixed(1)} points and Calvert-Lewin for {PARTNERS[1].xp10.toFixed(1)}. Yet beside Haaland, Calvert-Lewin adds {PARTNERS[1].gain.toFixed(1)} captain points and Bruno {PARTNERS[3].gain.toFixed(1)}: Calvert-Lewin&rsquo;s one big week lands exactly where Haaland is weakest.
          </p>
        </div>
      </section>

      <section aria-labelledby="vice-heading" className="space-y-3">
        <h2 id="vice-heading" className={H2}>How much is vice-captain insurance worth?</h2>
        <div className={PROSE}>
          <p>
            The <a href="https://www.premierleague.com/en/news/2174899" className={LINK} rel="noopener">official rules</a>: the captain scores double. If he doesn&rsquo;t feature at all in his match, the vice-captain scores double instead. If neither plays, nobody does. A one-minute substitute appearance counts as featuring: the captain keeps the armband and his 1 point becomes 2, and the vice-captain gets nothing extra.
          </p>
          <p>If the captain appears with probability <em>p</em> and the vice-captain with probability <em>q</em> and expected points V, the vice-captain adds</p>
          <code className={CODE}>insurance = (1 &minus; p) &times; q &times; V</code>
          <p>
            An illustration, not a projection: suppose a premium captain has a 5% chance of missing a match without warning before the deadline. A vice-captain who plays 97% of the time and is projected for 6.5 adds 0.05 &times; 0.97 &times; 6.5 &asymp; 0.3 points a week. But you always have <em>some</em> vice-captain. Paying for a better one only buys the difference: a vice projected for 6.5 instead of 5.5 is worth 0.05 &times; 0.97 &times; 1.0 &asymp; 0.05 a week, about half a point over ten weeks.
          </p>
          <p>
            Insurance pays only when the captain doesn&rsquo;t play. Rotation pays when he plays but someone else is projected higher. They are separate, and the second is usually much larger.
          </p>
        </div>
      </section>

      <section aria-labelledby="budget-heading" className="space-y-3">
        <h2 id="budget-heading" className={H2}>The &pound;100m problem</h2>
        <div className={PROSE}>
          <p>
            Every pound on one player is a pound not spent on another, so the right question is never &ldquo;is this player good?&rdquo; but &ldquo;does this squad score more than the best squad without him?&rdquo; That is what an optimiser answers, and why ranking players one at a time goes wrong.
          </p>
          <p>
            Points per &pound;m is a useful first filter but not the answer. Over these ten gameweeks Haaland is projected at {ppm(haaland.xp10, haaland.price)} points per &pound;m, worse than Bruno ({ppm(CANDIDATES[2].xp10, CANDIDATES[2].price)}) and far worse than Tavernier ({ppm(PARTNERS[2].xp10, PARTNERS[2].price)}). Yet he is in the best squad, and leaving him out costs {Math.abs(vs('no_haaland').total).toFixed(1)} points. Only eleven players score each week, so the points a slot produces matter more than the points per pound.
          </p>
          <p>
            The useful price is the <em>marginal</em> one: how many points an extra &pound;1m buys once the squad is already as good as it can be. Re-solving the best squad at budgets from &pound;95m to &pound;105m puts that at about {perMillion.toFixed(1)} points per &pound;1m over ten gameweeks. That is the yardstick for any premium: his captaincy gain has to be weighed against what the same money buys elsewhere.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      <h2 className="font-display uppercase tracking-wide text-xl text-pitch-800 border-b border-chalk-300 pb-1">Part two: gameweeks 6 to 15, 2026/27</h2>
      <p className="rounded-lg border-l-4 border-amber-500 bg-chalk-100 px-4 py-2 text-sm text-ink-700 max-w-prose">
        A dated case study. Projections as at {CASE_STUDY.projectedAt}, model {CASE_STUDY.modelVersion}, prices that day. The numbers below are frozen; <Link to="/fpl/player-points" className={LINK}>Player Projections</Link> has the current ones.
      </p>

      <section aria-labelledby="cands-heading" className="space-y-3">
        <h2 id="cands-heading" className={H2}>The candidates</h2>
        <div className={PROSE}>
          <p>
            Haaland is the most-owned player and the highest projected. Saka is &pound;{(haaland.price - saka.price).toFixed(1)}m cheaper and only {(haaland.xp10 - saka.xp10).toFixed(1)} points behind over the ten weeks. Bruno and Palmer are the other premiums managers most often pair with him; Palmer is flagged 75% fit, and the model has his start chance recovering from 0.70 this week to above 0.90 by GW9.
          </p>
        </div>
        <figure className="rounded-lg border border-chalk-300 bg-white p-3 max-w-2xl">
          <figcaption className="font-display uppercase tracking-wide text-sm text-ink-900 mb-1">Haaland leads most weeks; Saka edges him in five</figcaption>
          <ChartLegend items={CANDIDATES.map((c) => ({ label: c.name, swatchClass: SWATCH[c.name] }))} />
          <LineChart
            height={260}
            yMin={4}
            yMax={9}
            xLabel="Gameweek"
            yLabel="Projected points"
            ariaLabel={`Projected points by gameweek, GW6 to 15: ${CANDIDATES.map((c) => `${c.name} ${c.xp.map((v) => v.toFixed(1)).join(', ')}`).join('; ')}.`}
            series={CANDIDATES.map((c) => ({ id: c.name, label: c.name, strokeClass: STROKE[c.name], dots: true, points: c.xp.map((y, i) => ({ x: GWS[i], y })) }))}
            pointTitle={(s, p) => `${s.label}, GW${p.x}: ${p.y.toFixed(2)} points`}
          />
          <p className="text-sm text-ink-700 mt-1">Haaland&rsquo;s low point is GW12, away at Arsenal, the same match in which Saka is projected 5.7.</p>
        </figure>
        <DataTable
          caption="The four candidates, GW6 to 15"
          head={['Player', 'Price', 'Owned', 'Projected GW6–15', 'Start chance', 'Exp. minutes', 'Status']}
          rows={CANDIDATES.map((c) => [`${c.name} (${c.team})`, `£${c.price.toFixed(1)}m`, `${c.own.toFixed(1)}%`, c.xp10.toFixed(1), c.startProb.toFixed(2), c.xMins, c.status])}
        />
        <details className="text-sm max-w-3xl">
          <summary className="text-xs text-pitch-800 cursor-pointer underline underline-offset-2">Projected points by gameweek</summary>
          <div className="mt-2">
            <DataTable
              caption="Projected points by gameweek"
              head={['Player', ...GWS.map((g) => `GW${g}`)]}
              rows={CANDIDATES.map((c) => [c.name, ...c.xp.map((v, i) => `${v.toFixed(1)} ${c.opp[i]}`)])}
            />
          </div>
        </details>
      </section>

      <section aria-labelledby="who-heading" className="space-y-3">
        <h2 id="who-heading" className={H2}>Who wears the armband</h2>
        <CaptainGrid
          caption="The captain each week, by the options you own"
          gws={GWS}
          colour={GRID_COLOUR}
          short={SHORT}
          rows={[alone, hs, hb, hp, hsb, opt].map((c) => ({ label: c.label, path: c.path, total: c.captainPoints }))}
        />
        <div className={PROSE}>
          <p>
            With Saka, the armband splits five weeks each. Bruno takes it twice and Palmer once. The optimal squad (next section) ends up with four options. Calvert-Lewin and Tavernier, both about &pound;6m and bought for their own points, take one week each.
          </p>
        </div>
      </section>

      <section aria-labelledby="gain-heading" className="space-y-3">
        <h2 id="gain-heading" className={H2}>How much each partner adds</h2>
        <figure className="rounded-lg border border-chalk-300 bg-white p-3 max-w-2xl">
          <figcaption className="font-display uppercase tracking-wide text-sm text-ink-900 mb-1">Saka adds most, in steps; Palmer adds almost nothing</figcaption>
          <ChartLegend
            items={[
              { label: 'Haaland + Saka', swatchClass: SWATCH.Saka },
              { label: 'Haaland + Bruno', swatchClass: SWATCH.Bruno },
              { label: 'Haaland + Palmer', swatchClass: SWATCH.Palmer },
              { label: 'Optimal squad’s four options', swatchClass: SWATCH.Optimal, dashed: true },
            ]}
          />
          <LineChart
            height={240}
            yMin={0}
            yMax={5.5}
            xLabel="Gameweek"
            yLabel="Extra captain points, cumulative"
            ariaLabel={`Cumulative captain points gained over Haaland alone by gameweek 15: Haaland plus Saka ${hs.gain.toFixed(1)}, plus Bruno ${hb.gain.toFixed(1)}, plus Palmer ${hp.gain.toFixed(1)}, optimal squad ${opt.gain.toFixed(1)}.`}
            series={[
              { id: 'opt', label: 'Optimal squad', strokeClass: STROKE.Optimal, dashed: true, dots: true, points: cumulative(opt.path, alone.path) },
              { id: 'hs', label: 'Haaland + Saka', strokeClass: STROKE.Saka, dots: true, points: cumulative(hs.path, alone.path) },
              { id: 'hb', label: 'Haaland + Bruno', strokeClass: STROKE.Bruno, dots: true, points: cumulative(hb.path, alone.path) },
              { id: 'hp', label: 'Haaland + Palmer', strokeClass: STROKE.Palmer, dots: true, points: cumulative(hp.path, alone.path) },
            ]}
            pointTitle={(s, p) => `${s.label}: +${p.y.toFixed(2)} by GW${p.x}`}
          />
          <p className="text-sm text-ink-700 mt-1">
            Saka&rsquo;s {hs.gain.toFixed(1)} comes in five steps, and only one of them is big: GW10 (Hull at home), worth {sakaGaps.find((x) => x.g === 10)!.gap.toFixed(1)}.
          </p>
        </figure>
        <DataTable
          caption="Every player who would take the armband from Haaland at least once, GW6 to 15"
          head={['Player', 'Price', 'Projected GW6–15', 'Armband weeks', 'Rotation gain', 'Gain per £m']}
          rows={PARTNERS.map((p) => [`${p.name} (${p.team})`, `£${p.price.toFixed(1)}m`, p.xp10.toFixed(1), p.weeks, `+${p.gain.toFixed(2)}`, (p.gain / p.price).toFixed(2)])}
        />
        <p className="text-sm text-ink-700 max-w-prose">No other player in the game is projected above Haaland in any of the ten weeks, so no one else adds anything.</p>
      </section>

      <section aria-labelledby="squad-heading" className="space-y-3">
        <h2 id="squad-heading" className={H2}>What happens when you optimise the whole squad</h2>
        <div className={PROSE}>
          <p>
            The captain pairs above ignore the rest of the squad. The real test is to build the best possible &pound;100m squad with and without each premium and compare the totals. The optimiser, left free, picks Haaland and Saka, scoring {free.total.toFixed(1)} projected points over the ten gameweeks ({free.xi.toFixed(1)} from the XI and {free.captain.toFixed(1)} from captaincy).
          </p>
        </div>
        <DeltaBarChart
          title="Points against the optimiser's own squad"
          aLabel="Ordinary points"
          bLabel="Captaincy"
          rows={[
            { label: 'Haaland + Bruno', note: 'forced in; keeps Saka', a: vs('haaland_bruno').ordinary, b: vs('haaland_bruno').captaincy },
            { label: 'Haaland + Palmer', note: 'forced in; keeps Saka', a: vs('haaland_palmer').ordinary, b: vs('haaland_palmer').captaincy },
            { label: 'No Haaland', note: 'buys Saka, Bruno, Isak', a: vs('no_haaland').ordinary, b: vs('no_haaland').captaincy },
            { label: 'Haaland, no £9m+ partner', note: 'no other £9m+ player', a: vs('haaland_alone').ordinary, b: vs('haaland_alone').captaincy },
          ]}
          takeaway="Most of what Saka is worth is his own points: without a £9m+ partner the squad loses 20.6, and only 2.9 of that is captaincy."
        />
        <DataTable
          caption="Exact squad solves, GW6 to 15, £100m, no transfers"
          head={['Squad', 'Total', 'XI', 'Captaincy', 'v optimiser', 'Premiums', 'Armbands']}
          rows={SQUADS.map((s) => [s.label, s.total.toFixed(1), s.xi.toFixed(1), s.captain.toFixed(1), s.key === 'free' ? '—' : signed(s.total - free.total), s.premiums, s.captains])}
        />
        <div className={PROSE}>
          <p>
            Forcing Bruno in costs {Math.abs(vs('haaland_bruno').total).toFixed(1)} points, and none of it is captaincy. His two good weeks (GW12 and GW14) are exactly the weeks Calvert-Lewin and Tavernier already cover, so in a real squad he never gets the armband. Palmer is the same story at {Math.abs(vs('haaland_palmer').total).toFixed(1)}. Without Haaland, the optimiser buys Saka, Bruno and Isak and still finishes {Math.abs(vs('no_haaland').total).toFixed(1)} behind.
          </p>
        </div>
        <DataTable
          caption="The best squad at different budgets"
          head={['Budget', 'Projected GW6–15', 'Premiums bought']}
          rows={BUDGET_CURVE.map((b) => [`£${b.budget.toFixed(1)}m`, b.total.toFixed(1), b.premiums])}
        />
        <p className="text-sm text-ink-700 max-w-prose">
          About {perMillion.toFixed(1)} points per extra &pound;1m. Measured that way, Saka&rsquo;s 3.6 captain points are worth under &pound;2m of his &pound;{saka.price.toFixed(1)}m price; the rest is paid for by what he scores in your XI.
        </p>
      </section>

      <section aria-labelledby="third-heading" className="space-y-3">
        <h2 id="third-heading" className={H2}>Does a third captain add much?</h2>
        <div className={PROSE}>
          <p>
            As a captaincy option, barely. Adding Bruno to Haaland and Saka adds {(hsb.captainPoints - hs.captainPoints).toFixed(1)} captain points over ten weeks on paper, and nothing in the optimal squad, where cheaper players already cover his weeks.
          </p>
          <p>
            But the budget curve shows when a third premium does make sense. With &pound;102.5m or more, the optimiser buys Bruno as well, for his own points. A third premium follows from a bigger budget, such as higher team value; it isn&rsquo;t a reason to stretch one.
          </p>
        </div>
      </section>

      <section aria-labelledby="limits-heading" className="space-y-3">
        <h2 id="limits-heading" className={H2}>What the models can&rsquo;t predict</h2>
        <ul className="list-disc pl-5 text-ink-700 max-w-prose space-y-2">
          <li>
            <strong>The margins are smaller than the noise.</strong> Of Saka&rsquo;s five armband weeks, only GW10 has him more than a point ahead of Haaland; the others are {sakaGaps.filter((x) => x.g !== 10).map((x) => `+${x.gap.toFixed(1)}`).join(', ')}. Over four past seasons, when the top two captain options were less than a point apart, the higher-ranked one won about as often as he lost (<Link to={CAPTAIN_ARTICLE.path} className={LINK}>our captaincy article</Link>). The real gain from rotating is probably well below 3.6, most of it from GW10.
          </li>
          <li>
            <strong>Projections are averages.</strong> Haaland blanked in about a third of his starts over the last four seasons (<Link to={HAALAND_ARTICLE.path} className={LINK}>Haaland article</Link>). Choosing on the average is right over a season; in any one week it often loses.
          </li>
          <li>
            <strong>Playing time.</strong> The model gives nailed starters an appearance chance of effectively 100%. That makes vice-captain insurance worth almost nothing on its numbers (0.02 points over ten weeks in the optimal squad), which understates late withdrawals. It also gives some players with few minutes a high start chance; we checked these did not affect any result here.
          </li>
          <li>
            <strong>No transfers.</strong> Every squad here is held for ten weeks. With free transfers you can bring a partner in for his good run, so real squads can capture more rotation value than a fixed squad can.
          </li>
          <li>
            <strong>Linked outcomes.</strong> In GW12 Haaland and Saka play each other; goals for one side are goals against the other. Projections treat each player separately.
          </li>
        </ul>
      </section>

      <section aria-labelledby="conclusions-heading" className="space-y-3">
        <h2 id="conclusions-heading" className={H2}>What this means for your squad</h2>
        <div className="grid gap-3 sm:grid-cols-2 max-w-3xl">
          {[
            ['The maths (always true)', [
              'The armband adds one copy of the captain’s points, not two.',
              'A second option can only help your captaincy, and only in weeks he is projected above your first.',
              'Partners with good weeks where your first choice has bad ones beat partners with a higher total.',
            ]],
            ['What the model found (GW6–15)', [
              'Saka is the best partner for Haaland: +3.6 captain points, and his own points put him in the best squad anyway.',
              'Bruno and Palmer add little as captains and cost points when forced in.',
              'The best squad uses four captains, two of them £6m players.',
            ]],
            ['What to do', [
              'Pick the squad for total points, then captain the best option each week.',
              'Treat a second premium as a good player first and a captain second.',
              'Don’t pay extra for a vice-captain; any regular starter will do.',
            ]],
            ['What we don’t know', [
              'Most rotation weeks are within a point: close to a coin flip.',
              'Late team news and transfers change these numbers week to week.',
              'Projections update daily; this case study does not.',
            ]],
          ].map(([h, items]) => (
            <div key={h as string} className="rounded-lg border border-chalk-300 bg-white p-3">
              <h3 className={H3}>{h as string}</h3>
              <ul className="list-disc pl-5 text-sm text-ink-700 mt-1 space-y-1">
                {(items as string[]).map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="sources-heading" className="text-sm text-ink-700 max-w-prose space-y-1">
        <h2 id="sources-heading" className={H2}>Sources</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><a href="https://www.premierleague.com/en/news/2174899" className={LINK} rel="noopener">Premier League: FPL basics explained, managing your team</a> (captain and vice-captain).</li>
          <li><a href="https://www.premierleague.com/en/news/2174419" className={LINK} rel="noopener">Premier League: FPL basics explained, how to pick a squad</a> (&pound;100m, 2&ndash;5&ndash;5&ndash;3, three per club).</li>
          <li><a href="https://arxiv.org/abs/2505.02170" className={LINK} rel="noopener">Ramezani and Dinh (2025), A data-driven framework for team selection in Fantasy Premier League</a>, integer programming for squad and captain selection.</li>
        </ul>
      </section>
    </ArticleLayout>
  );
}

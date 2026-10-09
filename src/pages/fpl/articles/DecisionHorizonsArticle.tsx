// ============================================================================
// src/pages/fpl/articles/DecisionHorizonsArticle.tsx
//
// /fpl/articles/three-decisions-three-horizons (Chris, 9 Oct 2026): why
// captaincy, transfers and squad building are different optimisation
// problems. Figures: src/lib/fplArticleDecisions.ts. Captain partnerships
// are covered in their own article and only summarised here.
// ============================================================================

import { Link } from 'react-router-dom';
import ArticleBarChart from '../../../components/articles/ArticleBarChart';
import ArticleLayout, { DataTable, H2, LINK, PROSE, StatRow } from '../../../components/articles/ArticleLayout';
import LineChart, { ChartLegend } from '../../../components/history/LineChart';
import { CAPTAIN_ARTICLE, CAPTAIN_PAIRS_ARTICLE, DECISIONS_ARTICLE, HAALAND_ARTICLE } from '../../../lib/fplArticles';
import {
  CALVERT_LEWIN,
  cumulativeGain,
  DECISIONS_DATA as D,
  DUE_NAIVE,
  DUE_TEST,
  GW6_CAPTAINS,
  HIT,
  ISIDOR,
  OPTIMAL_SQUAD,
  OPTIMAL_TOTAL,
  PARTNER_SQUADS,
  REPLACEMENT,
  START_CALIBRATION,
  sum,
  TOP_15,
  VARIANCE,
  weeklyXI,
  WISSA,
} from '../../../lib/fplArticleDecisions';

const CODE = 'block font-mono text-sm bg-chalk-100 border border-chalk-300 rounded px-3 py-2 overflow-x-auto';
const H3 = 'font-display uppercase tracking-wide text-base text-ink-900';
// Validated as a set (dataviz validator, light surface). Literal classes so Tailwind generates them:
// stroke-[#2a7a4f] stroke-[#c08a1e] stroke-[#3567a8] fill-[#2a7a4f] fill-[#c08a1e] fill-[#3567a8] bg-[#2a7a4f] bg-[#c08a1e] bg-[#3567a8]
const LINE = { cl: 'stroke-[#2a7a4f]', isidor: 'stroke-[#c08a1e]', wissa: 'stroke-[#3567a8]', hit: 'stroke-ink-500' };
const SWATCH = { cl: 'bg-[#2a7a4f]', isidor: 'bg-[#c08a1e]', wissa: 'bg-[#3567a8]', hit: 'bg-ink-500' };
const POS = ['', 'GK', 'DEF', 'MID', 'FWD'];
const f1 = (v: number) => v.toFixed(1);
const signed = (v: number) => (v > 0.04 ? `+${f1(v)}` : v < -0.04 ? `−${f1(Math.abs(v))}` : '0.0');

export default function DecisionHorizonsArticle() {
  const gws = D.gws;
  const isidor10 = sum(ISIDOR.xp), cl10 = sum(CALVERT_LEWIN.xp);
  const gain = cumulativeGain(WISSA.xp, CALVERT_LEWIN.xp);
  const at = (n: number) => gain[n - 1];
  const breakEven = gain.findIndex((g) => g > 0) + 1;
  const hitWeek = gain.findIndex((g) => g > HIT) + 1;
  const xi = weeklyXI(OPTIMAL_SQUAD);
  const cost = sum(OPTIMAL_SQUAD.map((p) => p.price));
  const onPitch = sum(OPTIMAL_SQUAD.map((p) => p.price * (xi.starts.get(p.name) ?? 0))) / gws.length;
  const squadRows = OPTIMAL_SQUAD.map((p) => {
    const xp10 = sum(p.xp), r = REPLACEMENT[p.pos];
    const extra = p.price - r.price;
    return { ...p, xp10, starts: xi.starts.get(p.name) ?? 0, ppm: xp10 / p.price, par: xp10 - r.xp10, extra, parPerM: extra > 0.05 ? (xp10 - r.xp10) / extra : null };
  });
  // Attackers costing at least £0.5m above replacement (below that the ratio explodes: Barry is £0.2m above).
  const valueRows = squadRows.filter((r) => r.pos >= 3 && r.extra >= 0.5 && r.par > 0).sort((a, b) => b.parPerM! - a.parPerM!);
  const [top, second] = GW6_CAPTAINS;
  const spend = [1, 2, 3, 4].map((pos) => ({ pos, cost: sum(OPTIMAL_SQUAD.filter((p) => p.pos === pos).map((p) => p.price)) }));

  return (
    <ArticleLayout
      meta={DECISIONS_ARTICLE}
      next={[
        { label: 'Player Projections, with the captain planner', to: '/fpl/player-points' },
        { label: 'Rate My Team: your squad and the transfers the model rates most', to: '/fpl/rate-my-team' },
        { label: 'Optimiser: the best squad under budget', to: '/fpl/optimal-squad' },
        { label: CAPTAIN_PAIRS_ARTICLE.title, to: CAPTAIN_PAIRS_ARTICLE.path },
        { label: 'Starting Lineups and Minutes Outlook', to: '/fpl/line-ups' },
      ]}
      method={
        <>
          <p>
            <strong>Projections.</strong> FixtureShark&rsquo;s player projections, model {D.modelVersion}, generated {D.projectedAt}, for gameweeks 6 to 15 of 2026/27, with that day&rsquo;s prices and availability. Each projection is a player&rsquo;s expected FPL points for a fixture: his chance of starting and expected minutes, goals and assists from his team&rsquo;s expected goals (market prices blended with the site&rsquo;s Dixon&ndash;Coles model) and his share of them, clean sheets, bonus (simulated), saves and defensive contributions, all under FPL&rsquo;s scoring rules. Numbers here are frozen; <Link to="/fpl/player-points" className={LINK}>Player Projections</Link> has today&rsquo;s.
          </p>
          <p>
            <strong>Squad.</strong> The best fixed &pound;100m squad for the ten weeks, solved exactly (integer programming, HiGHS): 15 players, 2&ndash;5&ndash;5&ndash;3, at most three per club, each week&rsquo;s best legal XI and captain. Bench players score only if they start. Replacement level for a position is the best projected player within &pound;1.0m of the cheapest player there.
          </p>
          <p>
            <strong>&ldquo;Due&rdquo; test.</strong> FPL&rsquo;s own match records, 2023/24 to 2025/26 (seasons where FPL records starts): every start by a player averaging 4+ points a start over 15+ starts, whose previous three matches were also starts. Each is compared with his average in his other starts that season, leaving out the streak and the match itself.
          </p>
          <p>
            <strong>What isn&rsquo;t tested yet.</strong> How well the points projections are calibrated: the site&rsquo;s projections were overwritten after kick-off until gameweek 6, when pre-deadline copies started being kept. Once a few of those gameweeks are played, the projections can be scored against what happened.
          </p>
        </>
      }
    >
      <StatRow
        stats={[
          { value: `${f1(ISIDOR.xp[0])} v ${f1(CALVERT_LEWIN.xp[0])}`, label: 'Isidor v Calvert-Lewin, projected for GW6' },
          { value: `${f1(isidor10)} v ${f1(cl10)}`, label: 'the same two over GW6–15' },
          { value: '4.6', label: 'Haaland’s points per £m, the lowest of any regular starter in the best squad' },
          { value: signed(DUE_TEST[0].diff), label: 'points above his usual after three blanks: nobody is “due”' },
        ]}
      />

      <section aria-labelledby="open-heading" className="space-y-3">
        <h2 id="open-heading" className={H2}>The best player next week can be the worst transfer</h2>
        <div className={PROSE}>
          <p>
            For gameweek 6, Sunderland&rsquo;s Isidor (&pound;{f1(ISIDOR.price)}m) is projected for {f1(ISIDOR.xp[0])} points, more than Leeds&rsquo; Calvert-Lewin (&pound;{f1(CALVERT_LEWIN.price)}m) at {f1(CALVERT_LEWIN.xp[0])}. Sort a table by next week&rsquo;s points and Isidor wins. Over the next ten gameweeks Calvert-Lewin is projected for {f1(cl10)}, Isidor for {f1(isidor10)}.
          </p>
          <p>
            The reason is in the start chances. Isidor has played {117} minutes this season, all from the bench; he starts the next two games only because Brobbey is out with a hamstring injury until late October. Calvert-Lewin starts every week.
          </p>
          <p>
            Neither projection is wrong. They answer different questions. Who scores most next week is a captaincy question. Who adds most to your team over the time you will own him is a transfer question. Which fifteen players, together, score most under the rules is a squad question. Using one question&rsquo;s answer for another is where a lot of FPL points go missing.
          </p>
        </div>
        <figure className="rounded-lg border border-chalk-300 bg-white p-3 max-w-2xl">
          <figcaption className="font-display uppercase tracking-wide text-sm text-ink-900 mb-1">Two good weeks, then the bench</figcaption>
          <ChartLegend items={[{ label: `Isidor (£${f1(ISIDOR.price)}m)`, swatchClass: SWATCH.isidor }, { label: `Calvert-Lewin (£${f1(CALVERT_LEWIN.price)}m)`, swatchClass: SWATCH.cl }]} />
          <LineChart
            height={220}
            yMin={0}
            yMax={7}
            xLabel="Gameweek"
            yLabel="Projected points"
            ariaLabel={`Projected points by gameweek. Isidor: ${ISIDOR.xp.join(', ')}. Calvert-Lewin: ${CALVERT_LEWIN.xp.join(', ')}.`}
            series={[
              { id: 'i', label: 'Isidor', strokeClass: LINE.isidor, dots: true, points: ISIDOR.xp.map((y, i) => ({ x: gws[i], y })) },
              { id: 'c', label: 'Calvert-Lewin', strokeClass: LINE.cl, dots: true, points: CALVERT_LEWIN.xp.map((y, i) => ({ x: gws[i], y })) },
            ]}
            pointTitle={(s, p) => `${s.label}, GW${p.x}: ${p.y.toFixed(2)} points`}
          />
        </figure>
      </section>

      <section aria-labelledby="three-heading" className="space-y-3">
        <h2 id="three-heading" className={H2}>Three decisions, three questions</h2>
        <DataTable
          text
          caption="The three FPL decisions"
          head={['Decision', 'The question', 'Horizon', 'Common mistake']}
          rows={[
            ['Captaincy', 'Who is projected highest this gameweek?', 'This gameweek', 'Choosing on form, ownership or the season total'],
            ['Transfer', 'How many points does the swap add to my XI while I own him?', 'As long as you expect to keep him', 'Choosing on next week alone, or on player v player'],
            ['Squad', 'Which 15, together, score most within the rules?', 'Usually 5–10+ gameweeks', 'Ranking players one at a time, or by points per £m'],
          ]}
        />
        <p className="text-sm text-ink-700 max-w-prose">The horizons are a guide, not rules: fixture swings, double gameweeks, chips and the weeks left in the season all change them.</p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="cap-heading" className="space-y-3">
        <h2 id="cap-heading" className={H2}>Captaincy: one gameweek, one number</h2>
        <div className={PROSE}>
          <p>
            The armband doubles one player&rsquo;s points for one gameweek, so the question is narrow: whose expected points are highest <em>this</em> week? Everything that matters for that week is inside a good projection: how many goals his team should score against this opponent, home or away, his share of the goals and assists, penalties and set pieces, clean-sheet and defensive points where they apply, bonus, and whether he will play.
          </p>
          <p>
            Two things that feel relevant mostly aren&rsquo;t. Recent points are a noisy guide to next week&rsquo;s (see the &ldquo;due&rdquo; test below). And a player&rsquo;s reliability over the season doesn&rsquo;t matter for the armband; only his chance of playing <em>this</em> match does, and it is already in his projection. A player who is 75% to start has a quarter of a blank built in. In a double gameweek his two fixtures add up, which is why doubles dominate captaincy.
          </p>
        </div>
        <ArticleBarChart
          title={`GW6: ${top.name} is projected highest, not Haaland`}
          valueLabel="Projected points, GW6"
          format={(v) => v.toFixed(2)}
          rows={GW6_CAPTAINS.map((c) => ({ label: c.name, value: c.xp, highlight: c.name === top.name, note: c.fixture }))}
          takeaway={`Haaland is owned by ${f1(second.own)}% and has the most points this season (${second.seasonPts}); ${top.name} is owned by ${f1(top.own)}%. The gap is ${(top.xp - second.xp).toFixed(2)} points.`}
        />
        <DataTable
          caption="Where the GW6 projections come from"
          head={['Player', 'v', 'Start', 'xG', 'xA', 'Playing', 'Goals', 'Assists', 'Clean sheet', 'Bonus', 'Total']}
          rows={GW6_CAPTAINS.map((c) => [c.name, c.fixture, `${Math.round(c.start * 100)}%`, c.xg.toFixed(2), c.xa.toFixed(2), c.parts.appearance.toFixed(1), c.parts.goals.toFixed(1), c.parts.assists.toFixed(1), c.parts.cleanSheet.toFixed(1), c.parts.bonus.toFixed(1), c.xp.toFixed(2)])}
        />
        <div className={PROSE}>
          <p>
            Saka edges it on assists and an Arsenal clean-sheet chance that Haaland, away at Liverpool, doesn&rsquo;t have; Haaland still has the highest goal threat. The right pick is the highest projection. But a gap of {(top.xp - second.xp).toFixed(1)} points is small: over four seasons, when the top two captain options were within half a point, the top one won the head-to-head about as often as he lost it (49% against 46%) (<Link to={CAPTAIN_ARTICLE.path} className={LINK}>our captaincy test</Link>). Close calls are close.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="tr-heading" className="space-y-3">
        <h2 id="tr-heading" className={H2}>Transfers: what does the swap add, and for how long?</h2>
        <div className={PROSE}>
          <p>A transfer is a trade, so its value is a difference, summed over the weeks you will own the new player:</p>
          <code className={CODE}>transfer gain = &Sigma;<sub>t</sub> (points in &minus; points out) &minus; hits</code>
          <p>
            Take two regular starters at about the same price: Wissa (&pound;{f1(WISSA.price)}m) and Calvert-Lewin (&pound;{f1(CALVERT_LEWIN.price)}m). If you own Wissa, swapping him for Calvert-Lewin <em>loses</em> {f1(Math.abs(at(1)))} points in gameweek 6. It breaks even by gameweek {5 + breakEven}, is worth {signed(at(5))} after five weeks and {signed(at(10))} after ten, and frees &pound;{f1(WISSA.price - CALVERT_LEWIN.price)}m.
          </p>
        </div>
        <figure className="rounded-lg border border-chalk-300 bg-white p-3 max-w-2xl">
          <figcaption className="font-display uppercase tracking-wide text-sm text-ink-900 mb-1">Wissa to Calvert-Lewin: behind for a week, well ahead by ten</figcaption>
          <ChartLegend items={[{ label: 'Cumulative gain from the swap', swatchClass: SWATCH.cl }, { label: 'A 4-point hit', swatchClass: SWATCH.hit, dashed: true }]} />
          <LineChart
            height={220}
            yMin={-2}
            yMax={9}
            xLabel="Gameweek"
            yLabel="Points gained"
            ariaLabel={`Cumulative gain from Wissa to Calvert-Lewin by gameweek: ${gain.map((g) => g.toFixed(1)).join(', ')}; a hit costs 4.`}
            series={[
              { id: 'hit', label: 'Hit', strokeClass: LINE.hit, dashed: true, width: 1.5, points: gws.map((x) => ({ x, y: HIT })) },
              { id: 'g', label: 'Gain', strokeClass: LINE.cl, dots: true, points: gain.map((y, i) => ({ x: gws[i], y })) },
            ]}
            pointTitle={(s, p) => (s.id === 'hit' ? 'A 4-point hit' : `By GW${p.x}: ${p.y >= 0 ? '+' : ''}${p.y.toFixed(2)}`)}
          />
          <p className="text-sm text-ink-700 mt-1">Clears a 4-point hit only by gameweek {5 + hitWeek}.</p>
        </figure>
        <DataTable
          caption="The same swaps judged over different horizons"
          head={['Swap', 'GW6 only', '5 weeks', '10 weeks', 'Worth a free transfer?', 'Worth a hit?']}
          rows={[
            ['Wissa → Calvert-Lewin', signed(at(1)), signed(at(5)), signed(at(10)), 'Yes, if you keep him', `Only if you keep him ${hitWeek}+ weeks`],
            ['Calvert-Lewin → Isidor', signed(ISIDOR.xp[0] - CALVERT_LEWIN.xp[0]), signed(sum(ISIDOR.xp.slice(0, 5)) - sum(CALVERT_LEWIN.xp.slice(0, 5))), signed(isidor10 - cl10), 'No', 'No'],
          ]}
        />
        <div className={PROSE}>
          <p>The simple sum leaves out five things that change real decisions:</p>
        </div>
        <ul className="list-disc pl-5 text-ink-700 max-w-prose space-y-2">
          <li><strong>The horizon is how long you will keep him.</strong> Not a fixed five or ten weeks. And weeks further away are less certain (injuries, rotation, form), so they deserve less weight than the sum gives them.</li>
          <li><strong>Your XI, not the player.</strong> Points only count if he plays in your team. A defender who will mostly sit on your bench adds little however good his projection.</li>
          <li><strong>Free transfers have option value.</strong> You get one a week and can bank up to five (<a href="https://www.premierleague.com/en/news/2174907" className={LINK} rel="noopener">FPL rules</a>). Using one on a small gain spends flexibility you may want after an injury. In our ten-week multi-transfer solve, nine free transfers added about 8 points in all, under a point each: most transfers are worth little, a few are worth a lot.</li>
          <li><strong>Prices.</strong> If a player has risen since you bought him, you keep only &pound;0.1m of every &pound;0.2m rise when you sell. Selling a riser costs budget you may not get back.</li>
          <li><strong>Captaincy.</strong> A transfer can also change who you can captain. In the best squad below, Calvert-Lewin takes the armband in gameweek 12, when Haaland is away at Arsenal.</li>
        </ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="sq-heading" className="space-y-3">
        <h2 id="sq-heading" className={H2}>Squads: the best fifteen aren&rsquo;t the fifteen best</h2>
        <div className={PROSE}>
          <p>
            Pick the highest-projected players for each slot (two goalkeepers, five defenders, five midfielders, three forwards) and you get {f1(TOP_15.xp)} projected points over ten weeks, for &pound;{f1(TOP_15.cost)}m, with {TOP_15.maxPerClub} {TOP_15.club} players. Over budget and over the three-per-club limit. The real problem is to find the best squad <em>within</em> the rules, which is an integer programme (<a href="https://arxiv.org/abs/2505.02170" className={LINK} rel="noopener">Ramezani and Dinh, 2025</a>, describe the standard form).
          </p>
          <p>
            Solved exactly for gameweeks 6 to 15, the best &pound;100m squad projects {f1(OPTIMAL_TOTAL)} points, costs &pound;{f1(cost)}m, and has about &pound;{f1(onPitch)}m of it on the pitch in a typical week. It buys a &pound;4.0m goalkeeper it never plays: bench points only count when someone drops out, so the cheapest legal bench frees money for the XI.
          </p>
        </div>
        <ArticleBarChart
          title="Where the £99.5m goes"
          valueLabel="£m"
          format={(v) => `£${v.toFixed(1)}m`}
          rows={spend.map((s) => ({ label: `${POS[s.pos]} (${OPTIMAL_SQUAD.filter((p) => p.pos === s.pos).length})`, value: s.cost }))}
        />
        <h3 className={H3}>Points per &pound;m is the wrong ruler</h3>
        <div className={PROSE}>
          <p>
            Points per &pound;m divides by the whole price, as if a player bought for &pound;0m scored nothing. But you can always fill a slot cheaply with someone who plays: the best player within &pound;1m of the cheapest at each position projects {f1(REPLACEMENT[2].xp10)}&ndash;{f1(REPLACEMENT[3].xp10)} points over the ten weeks. The useful measure is what a player adds <em>above</em> that replacement, per extra &pound;1m spent:
          </p>
          <code className={CODE}>marginal value = (points &minus; replacement points) &divide; (price &minus; replacement price)</code>
        </div>
        <ArticleBarChart
          title="Among attackers, Haaland adds least per extra £1m"
          valueLabel="Points above replacement per extra £1m"
          format={(v) => v.toFixed(1)}
          rows={valueRows.map((r) => ({ label: r.name, value: r.parPerM!, highlight: r.name === 'Haaland' }))}
          takeaway="And the optimiser still buys him. Once the cheap, high-value starters are in, the eleven places run out before the money does; the leftover money buys most where one place can hold the most points. (Barry, £0.2m above replacement, is left off: his ratio is off the scale.)"
        />
        <details className="max-w-3xl">
          <summary className="text-xs text-pitch-800 cursor-pointer underline underline-offset-2">The whole squad</summary>
          <div className="mt-2">
            <DataTable
              caption="The best fixed £100m squad, GW6 to 15"
              head={['Player', 'Pos', 'Price', 'Projected', 'Starts (of 10)', 'Points per £m', 'Above replacement', 'Per extra £1m']}
              rows={squadRows.map((r) => [r.name, POS[r.pos], `£${f1(r.price)}m`, f1(r.xp10), r.starts, f1(r.ppm), signed(r.par), r.parPerM == null ? '—' : f1(r.parPerM)])}
            />
          </div>
        </details>
        <div className={PROSE}>
          <p>
            Where the marginal points are decides where the money goes. Right now the best value is in a few cheap, nailed attackers (Barry, Tavernier, Calvert-Lewin); the rest goes on the players who hold the most points per place, Haaland and Saka. That will change as prices and fixtures move, which is why the squad problem has to be re-solved, not remembered.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="pair-heading" className="space-y-3">
        <h2 id="pair-heading" className={H2}>Where the decisions meet: a second premium captain</h2>
        <div className={PROSE}>
          <p>
            The three questions overlap in one place: a second premium can be worth more than his own points because he can take the armband in your first premium&rsquo;s bad weeks. We tested that in <Link to={CAPTAIN_PAIRS_ARTICLE.path} className={LINK}>One captain or two?</Link>. In short: on these projections the best squad holds Haaland and Saka ({f1(PARTNER_SQUADS.withPartner)} points), against {f1(PARTNER_SQUADS.noPartner)} with no &pound;9m+ partner beside Haaland. But only {f1(PARTNER_SQUADS.captainPoints - PARTNER_SQUADS.captainPointsNoPartner)} of those {f1(PARTNER_SQUADS.withPartner - PARTNER_SQUADS.noPartner)} points is captaincy; the rest is Saka&rsquo;s own points. Allowing transfers doesn&rsquo;t change that. Two premiums pay when the second is a good player in his own right, not as captaincy insurance.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="unc-heading" className="space-y-3">
        <h2 id="unc-heading" className={H2}>Expected points, real points</h2>
        <div className={PROSE}>
          <p>
            Every number above is an average over the ways a gameweek can go. Real gameweeks are noisy: in our simulation of gameweek 6, any XI&rsquo;s score varied by about &plusmn;{VARIANCE.xiSd} points from its average, while the fifty best XIs were separated by only {VARIANCE.best50Spread} projected points. So a good decision often loses, and a bad one often wins. Judge decisions on what was known before the deadline, over many weeks, not on one result.
          </p>
        </div>
        <h3 className={H3}>Nobody is &ldquo;due&rdquo;</h3>
        <div className={PROSE}>
          <p>
            After three blanks in a row, regular starters scored {signed(DUE_TEST[0].diff)} points above their usual in the next game: no different from any other game. After three returns in a row, {signed(DUE_TEST[1].diff)}: no hot streak either. A player&rsquo;s next game is just his next game.
          </p>
          <p>
            One trap is worth knowing about, because we fell into it first. Compare the next game with the player&rsquo;s season average and he looks &ldquo;due&rdquo;: {f1(DUE_NAIVE.next)} against {f1(DUE_NAIVE.seasonAvg)}. But his season average includes the three blanks you picked him for. Against his other games the effect disappears. Miller and Sanjurjo (<a href="https://econometricsociety.org/publications/econometrica/2018/11/01/surprised-hot-hand-fallacy-truth-law-small-numbers" className={LINK} rel="noopener">2018</a>) show how easily streak comparisons mislead.
          </p>
        </div>
        <DataTable
          caption="Points in the next game, regular starters, 2023/24 to 2025/26"
          head={['After', 'Games', 'Next game', 'His usual', 'Difference']}
          rows={DUE_TEST.map((r) => [r.streak, r.n, r.next.toFixed(2), r.usual.toFixed(2), `${signed(r.diff)} ± ${(2 * r.se).toFixed(1)}`])}
        />
        <h3 className={H3}>How good are the projections?</h3>
        <div className={PROSE}>
          <p>
            A forecast is useful if it is calibrated: things it calls 30% happen about 30% of the time (<a href="https://ideas.repec.org/a/bla/jorssb/v69y2007i2p243-268.html" className={LINK} rel="noopener">Gneiting, Balabdaoui and Raftery, 2007</a>). We can check this for start chances: on gameweeks 3 to 5 ({START_CALIBRATION.playerMatches.toLocaleString('en-GB')} player-matches), the average predicted start chance was {Math.round(START_CALIBRATION.predicted * 100)}% and {Math.round(START_CALIBRATION.actual * 100)}% of those players actually started: close, slightly cautious. We can&rsquo;t yet do the same for points: until gameweek 6 the projections were overwritten after kick-off, so there is no honest record of what they said beforehand. That check comes once a few of the kept gameweeks are played.
          </p>
        </div>
        <h3 className={H3}>When expected points isn&rsquo;t the goal</h3>
        <div className={PROSE}>
          <p>
            Maximising expected points maximises your expected total. It doesn&rsquo;t maximise your chance of winning a mini-league or reaching the top 1%, which depends on what everyone else does. In the same simulation, a template XI of popular picks projected {f1(VARIANCE.template)} points and a differential XI {f1(VARIANCE.differential)}, but the differential XI had about twice the chance of a top-1% week ({VARIANCE.differentialTop1}% against {VARIANCE.templateTop1}%, with a simulated field that overstates both). Chasing a rank you need, late in a season, can justify giving up expected points. Most of the season, it doesn&rsquo;t.
          </p>
        </div>
        <h3 className={H3}>One decision v a sequence</h3>
        <div className={PROSE}>
          <p>
            Picking the best transfer each week isn&rsquo;t the same as planning the best sequence: a transfer now changes what you can do next week. Multi-week solvers plan the whole sequence, but they are only as good as their assumptions. Ours, left free, sold Haaland for one bad fixture and bought him back the week after, which only works because it held prices fixed; in the real game that round trip loses money (<Link to={CAPTAIN_PAIRS_ARTICLE.path} className={LINK}>details</Link>).
          </p>
        </div>
      </section>

      <section aria-labelledby="sum-heading" className="space-y-2">
        <h2 id="sum-heading" className={H2}>In short</h2>
        <ul className="list-disc pl-5 text-ink-700 max-w-prose space-y-1">
          <li>Captain the highest projection for <em>this</em> gameweek. Ignore the season total and ownership unless you are chasing a rank.</li>
          <li>Judge a transfer by what it adds to your XI over the weeks you will keep him, after hits, with near weeks counting most.</li>
          <li>Build the squad as one problem: cheap bench, value where the marginal points are, premiums where a single place can hold the most.</li>
          <li>Expect to be wrong often, and don&rsquo;t read a streak as a promise.</li>
        </ul>
      </section>

      <section aria-labelledby="src-heading" className="text-sm text-ink-700 max-w-prose space-y-1">
        <h2 id="src-heading" className={H2}>Sources</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><a href="https://www.premierleague.com/en/news/2174907" className={LINK} rel="noopener">Premier League: FPL basics, how to make transfers</a> (free transfers, banking, hits, selling price).</li>
          <li><a href="https://www.premierleague.com/en/news/2174419" className={LINK} rel="noopener">Premier League: FPL basics, how to pick a squad</a> (&pound;100m, 2&ndash;5&ndash;5&ndash;3, three per club).</li>
          <li><a href="https://arxiv.org/abs/2505.02170" className={LINK} rel="noopener">Ramezani and Dinh (2025), A data-driven framework for team selection in Fantasy Premier League</a>.</li>
          <li><a href="https://eprints.lancs.ac.uk/id/eprint/19492" className={LINK} rel="noopener">Dixon and Coles (1997), Modelling association football scores and inefficiencies in the football betting market</a>.</li>
          <li><a href="https://ideas.repec.org/a/bla/jorssb/v69y2007i2p243-268.html" className={LINK} rel="noopener">Gneiting, Balabdaoui and Raftery (2007), Probabilistic forecasts, calibration and sharpness</a>.</li>
          <li><a href="https://econometricsociety.org/publications/econometrica/2018/11/01/surprised-hot-hand-fallacy-truth-law-small-numbers" className={LINK} rel="noopener">Miller and Sanjurjo (2018), Surprised by the hot hand fallacy? A truth in the law of small numbers</a>.</li>
          <li>FixtureShark: <Link to={CAPTAIN_ARTICLE.path} className={LINK}>captaincy backtest</Link>, <Link to={HAALAND_ARTICLE.path} className={LINK}>Haaland article</Link>, <Link to={CAPTAIN_PAIRS_ARTICLE.path} className={LINK}>captain partnerships</Link>.</li>
        </ul>
      </section>
    </ArticleLayout>
  );
}

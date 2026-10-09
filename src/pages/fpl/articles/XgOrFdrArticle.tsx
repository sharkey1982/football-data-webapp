// ============================================================================
// src/pages/fpl/articles/XgOrFdrArticle.tsx
//
// /fpl/articles/xg-or-fdr (Chris, 9 Oct 2026): does FPL's fixture
// difficulty rating or an expected-goals fixture rating better predict FPL
// points? Figures: src/lib/fplArticleXgFdr.ts, from
// scripts/analysis_xg_vs_fdr.py. One-off analysis; no model changed.
// ============================================================================

import { Link } from 'react-router-dom';
import ArticleBarChart from '../../../components/articles/ArticleBarChart';
import ArticleLayout, { DataTable, H2, LINK, PROSE, StatRow } from '../../../components/articles/ArticleLayout';
import { CAPTAIN_ARTICLE, DECISIONS_ARTICLE, HAALAND_ARTICLE, XG_FDR_ARTICLE } from '../../../lib/fplArticles';
import {
  BETWEEN,
  BETWEEN_DIFF,
  BETWEEN_H2H,
  BY_FDR,
  FDR_TIES,
  HINDSIGHT,
  MARKET_FIFTHS,
  mergedBands,
  PREDICTOR_LABEL,
  type Predictor,
  SAME,
  SAME_BY_SEASON,
  SAME_H2H,
  SAME_VARIANTS,
  XG_BY_FDR_MID,
  XG_FDR as D,
} from '../../../lib/fplArticleXgFdr';

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const;
const pct = (v: number) => `${v.toFixed(1)}%`;
const pp = (v: number) => `${v > 0.04 ? '+' : v < -0.04 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
const ci = (lo: number, hi: number) => `${pp(lo)} to ${pp(hi)}`;
const int = (v: number) => v.toLocaleString('en-GB');
/** Bars start at a coin flip (50%), so their length is the edge over guessing. */
const aboveCoin = (v: number) => `${(v + 50).toFixed(1)}%`;

export default function XgOrFdrArticle() {
  const betweenOrder: Predictor[] = ['mkt', 'xg', 'price', 'pts90', 'xgi90', 'fdr'];
  const def = mergedBands(BY_FDR.DEF);
  return (
    <ArticleLayout
      meta={XG_FDR_ARTICLE}
      method={<Method />}
      next={[
        { label: 'Should you always captain Haaland, even away at Arsenal?', to: HAALAND_ARTICLE.path },
        { label: 'Three FPL decisions, three time horizons', to: DECISIONS_ARTICLE.path },
        { label: 'Should you always captain the top-projected player?', to: CAPTAIN_ARTICLE.path },
        { label: 'Match projections: projected FPL points by gameweek', to: '/fpl' },
        { label: 'Minutes: who is likely to start', to: '/fpl/minutes' },
      ]}
    >
      <section className={PROSE}>
        <p>
          FPL&rsquo;s fixture difficulty rating (FDR) gives every fixture a number from 1 (easiest) to 5 (hardest). Many managers
          now plan with expected goals (xG) instead: how many good chances a team has been creating and conceding. We tested
          both against what actually happened: {int(D.starts)} Premier League starts from {D.seasons}, scored with FPL&rsquo;s
          own points.
        </p>
        <p>
          The answer depends on which decision you are making. FDR rates the opponent, not your player&rsquo;s team. That
          makes it a weak guide for choosing <em>between</em> players, but a sound one for choosing <em>when</em> to play the
          same player.
        </p>
      </section>

      <StatRow
        stats={[
          { value: int(D.starts), label: `starts tested, ${D.seasons}` },
          { value: pct(100 - SAME_H2H.xg.right), label: 'how often FDR was right when it and a 10-GW xG rating disagreed about a player’s weeks' },
          { value: `+${BETWEEN_DIFF.xg.d.toFixed(1)}`, label: 'percentage points the xG rating gained over FDR when choosing between players' },
          { value: pct(D.fdrRevisedShare), label: 'of these starts had a different FDR by the end of the season' },
        ]}
      />

      <section className={PROSE} aria-labelledby="scoring">
        <h2 id="scoring" className={H2}>How we scored each number</h2>
        <p>
          Take two starts with different FPL points. A predictor is &ldquo;right&rdquo; if it rated the higher scorer&rsquo;s
          fixture or player as the better one. Over hundreds of thousands of pairs, 50% is a coin flip and 100% is perfect.
          One match is noisy, so even the best number here is right about 60% of the time. Where a predictor rates two starts
          the same, as FDR often does, it gets half a point.
        </p>
        <p>We asked two questions, because FPL asks both:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Between players:</strong> two starters in the same gameweek and position. Which one will score more?</li>
          <li><strong>Same player:</strong> two of one player&rsquo;s starts in the same season. Which week will be better? This is the question behind timing a transfer, a bench decision or a chip.</li>
        </ul>
        <p>
          Our <strong>xG fixture rating</strong> is the team&rsquo;s xG per match over its last 10 gameweeks, times the opponent&rsquo;s xG conceded per match, adjusted for home and
          away. Defenders and goalkeepers get the mirror image, the goals they are expected to concede. For scale we also
          scored <strong>market-implied team goals</strong> (the goals that closing betting prices imply for each team) and
          three player numbers: xG plus xA per 90 minutes, points per 90 and price. Every input uses only matches played
          before the gameweek. Every FDR is the one FPL was showing before kick-off, not today&rsquo;s.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="between">
        <h2 id="between" className={H2}>Choosing between players: xG beats FDR</h2>
        <ArticleBarChart
          title="Picking the higher scorer of two starters in the same gameweek and position"
          rows={betweenOrder.map((k) => ({ label: PREDICTOR_LABEL[k], value: BETWEEN.ALL[k] - 50, highlight: k === 'fdr' }))}
          format={aboveCoin}
          valueLabel="Pairs right"
          takeaway="Bars start at 50%, a coin flip. FDR is the weakest of the six."
        />
        <div className={PROSE}>
          <p>
            FDR got {pct(BETWEEN.ALL.fdr)} of pairs right and the xG fixture rating {pct(BETWEEN.ALL.xg)}, a gain of{' '}
            {BETWEEN_DIFF.xg.d.toFixed(1)} percentage points (95% interval {ci(BETWEEN_DIFF.xg.lo, BETWEEN_DIFF.xg.hi)}). FDR scored worst
            of the six numbers, below even price.
          </p>
          <p>
            The reason is what FDR leaves out. Two defenders both facing an FDR 3 fixture get the same rating, even if one
            plays for the best defence in the league and the other for the worst. The xG rating includes both teams, so it
            separates them. The market does the same job with better information and gained {BETWEEN_DIFF.mkt.d.toFixed(1)}{' '}
            percentage points on FDR.
          </p>
          <p>
            By position, the fixture matters most for defenders, where a clean sheet is most of the return. For midfielders,
            the player matters as much as the fixture: xG plus xA per 90 ({pct(BETWEEN.MID.xgi90)}) beat both the xG fixture
            rating and FDR.
          </p>
        </div>
        <DataTable
          caption="Pairs of starters right, by position"
          head={['Pos.', 'FDR', 'xG', 'Market', 'xGI/90']}
          rows={POSITIONS.map((p) => [p, pct(BETWEEN[p].fdr), pct(BETWEEN[p].xg), pct(BETWEEN[p].mkt), pct(BETWEEN[p].xgi90)])}
        />
      </section>

      <section className="space-y-3" aria-labelledby="same">
        <h2 id="same" className={H2}>Timing the same player: FDR holds its own</h2>
        <div className={PROSE}>
          <p>
            Once the player is fixed, his own team&rsquo;s strength drops out. What is left is the opponent and home or away,
            and FDR rates exactly that. Here the 10-gameweek xG rating did <em>worse</em> than FDR: {pct(SAME.ALL.xg)} against{' '}
            {pct(SAME.ALL.fdr)}.
          </p>
          <p>
            That surprised us, so we tried four more xG ratings: longer windows (20 and 38 gameweeks) and versions that look
            only at the opponent. All of them are shown below. None beat FDR. The best one, the opponent&rsquo;s xG over a
            full 38 gameweeks, drew level. The 10-gameweek version was chosen before the analysis ran; the others were added
            after it lost.
          </p>
        </div>
        <ArticleBarChart
          title="Picking the better of two starts by the same player"
          rows={SAME_VARIANTS.map((v) => ({ label: v.short, note: v.label, value: v.right - 50, highlight: v.key === 'fdr' }))}
          format={aboveCoin}
          valueLabel="Pairs right"
          takeaway="Bars start at 50%. No xG rating beat FDR; market team goals did."
        />
        <p className="text-sm text-ink-700 max-w-prose">
          &ldquo;Opp. xG&rdquo; looks only at the opponent: what it concedes (for attackers) or creates (for defenders). Differences
          are in percentage points.
        </p>
        <DataTable
          caption="Each rating against FDR, same player"
          head={['Rating', '% right', 'v FDR', '95% range']}
          rows={SAME_VARIANTS.filter((v) => v.d !== null).map((v) => [v.short, v.right.toFixed(1), pp(v.d as number), ci(v.lo as number, v.hi as number)])}
        />
        <div className={PROSE}>
          <p>
            The disagreements tell the same story. In {int(SAME_H2H.xg.pairs)} pairs of a player&rsquo;s weeks, FDR and the
            10-gameweek xG rating pointed opposite ways. FDR was right in {pct(100 - SAME_H2H.xg.right)} of them.
          </p>
          <p>
            FDR&rsquo;s real weakness is coarseness. With only five levels, it rates {pct(FDR_TIES.tiedShare)} of a
            player&rsquo;s pairs of weeks the same. When it does separate two weeks, it is right {pct(FDR_TIES.strictRight)} of
            the time. Most of the market&rsquo;s edge comes from separating weeks FDR calls equal. When the market and FDR
            actually disagreed, the market was right only {pct(SAME_H2H.mkt.right)} of the time, barely better than a coin
            flip.
          </p>
          <p>
            Why does a rolling xG rating struggle? Ten gameweeks is a small sample. A team&rsquo;s xG over that window moves
            with injuries, red cards, game state and the opponents it happened to face. Longer windows help, which fits that
            explanation. FPL doesn&rsquo;t publish how it sets FDR, so we can&rsquo;t say what it uses instead. But it clearly
            isn&rsquo;t just recent xG.
          </p>
        </div>
        <DataTable
          caption="Same-player pairs right, by position"
          head={['Pos.', 'FDR', 'xG (10 GWs)', 'Market']}
          rows={POSITIONS.map((p) => [p, pct(SAME[p].fdr), pct(SAME[p].xg), pct(SAME[p].mkt)])}
        />
        <DataTable
          caption="Same-player pairs right, by season"
          head={['Season', 'FDR', 'xG (10 GWs)', 'Market']}
          rows={SAME_BY_SEASON.map((s) => [s.season, pct(s.fdr), pct(s.xg), pct(s.mkt)])}
        />
        <p className="text-ink-700 max-w-prose">
          FDR beat the 10-gameweek xG rating in three seasons out of four; in 2023/24 the two were level. 2022/23 was the xG
          rating&rsquo;s worst season, partly because FPL has no xG for 2021/22, so its early-season windows were short.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="size">
        <h2 id="size" className={H2}>How much a fixture is worth</h2>
        <div className={PROSE}>
          <p>
            Whichever number you use, the fixture matters most for defenders. A defender averaged {def[0].pts.toFixed(1)}{' '}
            points per start at FDR 1&ndash;2 and {def[def.length - 1].pts.toFixed(1)} at FDR 5. The market spreads players
            further apart because it also knows the team. Defenders in the easiest fifth of fixtures by the market averaged{' '}
            {MARKET_FIFTHS.DEF.easiest.toFixed(1)}, and those in the hardest fifth {MARKET_FIFTHS.DEF.hardest.toFixed(1)}.
          </p>
        </div>
        <DataTable
          caption="Average FPL points per start by the FDR shown before kick-off"
          head={['FDR', ...POSITIONS]}
          rows={def.map((b, i) => [b.label, ...POSITIONS.map((p) => mergedBands(BY_FDR[p])[i].pts.toFixed(2))])}
        />
        <p className="text-ink-700 max-w-prose text-sm">
          FDR 1 is rare (under 70 starts per position in four seasons), so it is merged with 2. Forwards at FDR 5 scored
          slightly more than at FDR 4, from only {BY_FDR.FWD[4].n} starts.
        </p>
        <div className={PROSE}>
          <p>
            The two measures mostly agree on which fixtures are hard. For midfielders&rsquo; starts, the xG rating&rsquo;s
            expected team goals fell steadily from {XG_BY_FDR_MID[0].xg.toFixed(2)} at FDR 1 to{' '}
            {XG_BY_FDR_MID[4].xg.toFixed(2)} at FDR 5. They differ at the margins, and that is where the tests above are
            decided.
          </p>
        </div>
      </section>

      <section className={PROSE} aria-labelledby="hindsight">
        <h2 id="hindsight" className={H2}>FDR changes during the season</h2>
        <p>
          FPL revises FDR as the season goes on. By the end of each season, between 79 and 255 of its 380 fixtures had a
          different rating from the one shown before kick-off. The end-of-season ratings score better: {pct(HINDSIGHT.same.end)}{' '}
          against {pct(HINDSIGHT.same.live)} on timing. But no manager could have used them, so a test that uses today&rsquo;s
          ratings for past matches flatters FDR. Here every FDR is the one that was live at the time. The same applies to planning: the FDR you see in August for a match in March is provisional.
        </p>
      </section>

      <section className={PROSE} aria-labelledby="use">
        <h2 id="use" className={H2}>What to use</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Choosing between two players:</strong> don&rsquo;t lean on FDR. It can&rsquo;t see that one team is far
            stronger than the other. Use something that rates both teams, and for midfielders weigh the player&rsquo;s own
            xG and xA at least as heavily as the fixture.
          </li>
          <li>
            <strong>Timing one player&rsquo;s weeks:</strong> FDR is a fair guide. Don&rsquo;t swap it for a short-window xG
            table. If you use xG, use a long window. FDR rates a third of a player&rsquo;s pairs of weeks the same, so break
            those ties with a finer number.
          </li>
          <li>
            <strong>For both:</strong> market-implied team goals were the best fixture number we tested. FixtureShark&rsquo;s{' '}
            <Link to="/fpl" className={LINK}>match projections</Link> use them for each team&rsquo;s goals where a price
            exists.
          </li>
          <li>
            <strong>Before any of it:</strong> every number here assumes the player starts. Neither FDR nor xG tells you that;
            check <Link to="/fpl/minutes" className={LINK}>minutes</Link> first.
          </li>
        </ul>
        <p>
          Fixtures matter even for the very best players. For how much they moved Haaland&rsquo;s returns home and away, see{' '}
          <Link to={HAALAND_ARTICLE.path} className={LINK}>should you always captain Haaland</Link>.
        </p>
      </section>
    </ArticleLayout>
  );
}

function Method() {
  return (
    <>
      <p>
        <strong>Sample.</strong> Every Premier League start from {D.seasons} ({int(D.startsAll)} starts) with FPL&rsquo;s own
        points. A start is FPL&rsquo;s start flag; early 2022/23 rows, before FPL recorded starts, count 45+ minutes. We
        dropped {int(D.startsAll - D.starts)} starts that lacked five earlier matches for either team or 270 earlier minutes
        for the player, which leaves {int(D.starts)}. Every predictor is scored on the same starts. 2021/22 is excluded
        because FPL has no xG for it.
      </p>
      <p>
        <strong>FDR before kick-off.</strong> We only store FDR for the current season, so past FDRs come from the public
        FPL archive (github.com/vaastav/Fantasy-Premier-League). Its fixtures file was saved {D.fdrRevisedFixtures.map((s) => `${s.snapshots} times in ${s.season}`).join(', ')}.
        For each match we used the last save before kick-off. That was usually 2 to 3 days before; in 2025/26, with fewer
        saves, a median of 28 days. Fixture ids and teams matched our history for all 1,520 matches. FDR is per team per
        fixture.
      </p>
      <p>
        <strong>xG fixture rating.</strong> Team xG for a match is the sum of FPL&rsquo;s player xG. Attack rating = own xG
        per match &times; opponent&rsquo;s xG conceded per match &divide; the league average, &times; a home factor (the square
        root of home over away goals, {D.homeGoals.toFixed(2)} v {D.awayGoals.toFixed(2)} per match, from {int(D.homeMatches)}{' '}
        earlier Premier League matches; divided for away teams). Defence rating is the same for goals against. Windows are
        the last 10 (or 20 or 38) gameweeks the team played, this season and last only. Midfielders and forwards are rated
        on attack; goalkeepers and defenders on defence. This was fixed before running.
      </p>
      <p>
        <strong>Market team goals.</strong> The Poisson pair of team goals that best fits the closing 1X2 and over/under 2.5
        prices (average across bookmakers, margin removed). Used as information, the same way the site&rsquo;s projections
        use it.
      </p>
      <p>
        <strong>Scoring.</strong> Pairs with equal points are skipped; ties in a predictor count half. Between players: every
        pair of starters in the same gameweek and position ({int(D.pairsBetween)} pairs). Same player: every pair of one
        player&rsquo;s starts in a season ({int(D.pairsSame)} pairs). The 95% intervals resample gameweeks (between players)
        or player-seasons (same player) 1,000 times.
      </p>
      <p>
        <strong>Code.</strong> scripts/analysis_xg_vs_fdr.py and scripts/analysis/build_fdr_pit.py; run on 9 Oct 2026. This
        is a one-off analysis; no FixtureShark model was changed.
      </p>
      <p>
        <strong>Between-player disagreements.</strong> When FDR and the xG rating ordered two players oppositely, the xG rating
        was right {pct(BETWEEN_H2H.xg.right)} of the time and the market {pct(BETWEEN_H2H.mkt.right)} (against FDR).
      </p>
    </>
  );
}

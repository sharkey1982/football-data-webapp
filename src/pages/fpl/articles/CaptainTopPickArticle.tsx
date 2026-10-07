// ============================================================================
// src/pages/fpl/articles/CaptainTopPickArticle.tsx
//
// /fpl/articles/always-captain-the-top-pick
// Figures: src/lib/fplArticles.ts (scripts/analysis/captaincy_*.sql).
// ============================================================================

import ArticleBarChart from '../../../components/articles/ArticleBarChart';
import ArticleLayout, { DataTable, H2, PROSE, StatRow } from '../../../components/articles/ArticleLayout';
import {
  CAPTAIN_ARTICLE,
  CAPTAIN_BY_SEASON,
  CAPTAIN_GAP_BINS,
  CAPTAIN_LADDER,
  CAPTAIN_STRATEGIES as S,
  HAALAND_ARTICLE,
  pct,
} from '../../../lib/fplArticles';

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

export default function CaptainTopPickArticle() {
  const perSeason = Math.round(S.topVsSecond.mean * 36);
  const lowSeason = Math.round((S.topVsSecond.mean - 2 * S.topVsSecond.se) * 36);
  const highSeason = Math.round((S.topVsSecond.mean + 2 * S.topVsSecond.se) * 36);
  const vsCrowd = Math.round(S.topVsMostOwned.mean * 36);
  const total = (k: 'top' | 'second' | 'mostOwned' | 'hindsight') => CAPTAIN_BY_SEASON.reduce((a, s) => a + s[k], 0);
  return (
    <ArticleLayout
      meta={CAPTAIN_ARTICLE}
      next={[
        { label: 'This week’s expected points for every player', to: '/fpl/player-points' },
        { label: HAALAND_ARTICLE.title, to: HAALAND_ARTICLE.path },
        { label: 'Rate My Team: your squad against the model', to: '/fpl/rate-my-team' },
      ]}
      method={
        <>
          <p>
            Every gameweek from 3 to 38 of 2022/23 to 2025/26 ({S.gameweeks} gameweeks; 2022/23 lost gameweek 7 to the postponements). The candidates each week were the 20 most-owned players who started their team&rsquo;s last match and whose team had a fixture.
          </p>
          <p>
            Each was ranked by a simple estimate made before the deadline: FPL points per start over his last 10 starts, scaled by his team&rsquo;s goals expected by the betting market this week against its expected goals in those 10 games. Double gameweeks add both fixtures. A player who then didn&rsquo;t play scores 0.
          </p>
          <p>
            This is deliberately simpler than the site&rsquo;s projections, which can&rsquo;t be tested honestly on past seasons: until October 2026 they were overwritten after kick-off. The estimate also runs high (its top pick averaged 10.1 expected against 7.3 scored), so read it as a ranking. A better estimate should widen the gaps here, not close them.
          </p>
          <p>Points are the captain&rsquo;s own FPL score, which is what the armband adds.</p>
        </>
      }
    >
      <StatRow
        stats={[
          { value: S.topRanked.toFixed(1), label: 'extra points a week from the top-ranked captain' },
          { value: S.mostOwned.toFixed(1), label: 'from captaining the most-owned player' },
          { value: pct(S.topWasBest), label: 'of weeks the top pick was the best captain' },
          { value: pct(S.topBlanked), label: 'of weeks the top pick blanked (2 or fewer)' },
        ]}
      />

      <section aria-labelledby="ladder-heading" className="space-y-3">
        <h2 id="ladder-heading" className={H2}>The ranking works</h2>
        <div className={PROSE}>
          <p>
            Rank the candidates by expected points and the actual points fall almost step by step: the top-ranked captain averaged {S.topRanked.toFixed(1)} a week, the 5th {CAPTAIN_LADDER[4].points.toFixed(1)}, the 10th {CAPTAIN_LADDER[9].points.toFixed(1)}. Picking at random from the 20 would have averaged {S.allCandidates.toFixed(1)}.
          </p>
        </div>
        <ArticleBarChart
          title="Higher expected points, more points scored"
          valueLabel="Avg points a week"
          format={(v) => v.toFixed(1)}
          rows={CAPTAIN_LADDER.map((r) => ({ label: `Ranked ${ORD[r.rank]}`, value: r.points, highlight: r.rank === 1 }))}
          takeaway="Each step down the ranking cost about half a point a week on average, though neighbouring ranks overlap."
        />
      </section>

      <section aria-labelledby="edge-heading" className="space-y-3">
        <h2 id="edge-heading" className={H2}>But the edge over the next choice is small</h2>
        <div className={PROSE}>
          <p>
            Against the second-ranked player the top pick gained {S.topVsSecond.mean.toFixed(1)} points a week, about {perSeason} a season. Four seasons can&rsquo;t pin that down: allowing for chance, the true edge could be anything from {lowSeason} to {highSeason} points a season, so it could even be nothing. In 2023/24 the second choice beat the first by {CAPTAIN_BY_SEASON[1].second - CAPTAIN_BY_SEASON[1].top} points.
          </p>
        </div>
        <DataTable
          caption="Captain points by season"
          head={['Season', 'Gameweeks', 'Top-ranked', '2nd-ranked', 'Most-owned', 'Hindsight']}
          rows={[
            ...CAPTAIN_BY_SEASON.map((s) => [s.season, s.gameweeks, s.top, s.second, s.mostOwned, s.hindsight]),
            ['All four', S.gameweeks, total('top'), total('second'), total('mostOwned'), total('hindsight')],
          ]}
        />
        <p className="text-xs text-ink-500 max-w-prose">Hindsight is the best of the 20 candidates each week: what nobody gets.</p>
      </section>

      <section aria-labelledby="feel-heading" className="space-y-3">
        <h2 id="feel-heading" className={H2}>Why the right pick so often feels wrong</h2>
        <div className={PROSE}>
          <p>
            The top-ranked captain was the week&rsquo;s best choice only {pct(S.topWasBest)} of the time. He blanked in {pct(S.topBlanked)} of weeks and hauled (10 or more) in {pct(S.topHauled)}. Hindsight captains averaged {S.hindsight.toFixed(1)}, twice what any rule managed, so almost every week someone you passed over scores more.
          </p>
          <p>
            That isn&rsquo;t evidence the pick was wrong. One player&rsquo;s score in one match is mostly noise: a goal is worth 4 to 6 points, and even the best forwards score in under half their games.
          </p>
        </div>
      </section>

      <section aria-labelledby="gap-heading" className="space-y-3">
        <h2 id="gap-heading" className={H2}>When the gap is small, it&rsquo;s a coin flip</h2>
        <div className={PROSE}>
          <p>
            How far the top pick was ahead decided whether ranking him first meant much. With less than a point between the top two, the top pick won the head-to-head about as often as he lost it. With two points or more between them he won {pct(CAPTAIN_GAP_BINS[3].topWon)} and scored {CAPTAIN_GAP_BINS[3].actual.toFixed(1)} more on average.
          </p>
        </div>
        <DataTable
          caption="Top pick against the second, by the gap in expected points"
          head={['Expected gap', 'Weeks', 'Expected edge', 'Actual edge', 'Top won', 'Top lost']}
          rows={CAPTAIN_GAP_BINS.map((b) => [b.gap, b.gameweeks, b.expected.toFixed(1), (b.actual > 0 ? '+' : '') + b.actual.toFixed(1), pct(b.topWon), pct(b.topLost)])}
        />
        <p className="text-sm text-ink-700 max-w-prose">Ties make up the rest.</p>
      </section>

      <section aria-labelledby="crowd-heading" className="space-y-3">
        <h2 id="crowd-heading" className={H2}>Against the crowd</h2>
        <div className={PROSE}>
          <p>
            The top-ranked player was also the most-owned only {pct(S.sameAsMostOwned)} of the time. In the other weeks he scored {S.topVsMostOwnedWhenDifferent.toFixed(1)} more on average, and over the whole period about {vsCrowd} points a season more than always captaining the most-owned player.
          </p>
          <p>
            Captaining the crowd&rsquo;s player protects your rank when he hauls; it doesn&rsquo;t score more. And the margins are small next to the noise: in {CAPTAIN_GAP_BINS[0].gameweeks + CAPTAIN_GAP_BINS[1].gameweeks} of the {S.gameweeks} weeks the top two were less than a point apart, while our simulations put a whole team&rsquo;s chance variation at about 15 points a week.
          </p>
        </div>
      </section>

      <section aria-labelledby="rule-heading" className="space-y-2">
        <h2 id="rule-heading" className={H2}>So what should you do?</h2>
        <ul className="list-disc pl-5 text-ink-700 max-w-prose space-y-1">
          <li>Captain the player with the highest expected points when he is clearly ahead (two points or more).</li>
          <li>When the top options are within a point, it barely matters which you pick; choose on minutes risk or how many rivals own him.</li>
          <li>Judge the choice over a season, not a week. A good pick blanks more than a quarter of the time.</li>
        </ul>
      </section>
    </ArticleLayout>
  );
}

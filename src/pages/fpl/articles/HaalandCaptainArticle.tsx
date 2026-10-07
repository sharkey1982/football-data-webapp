// ============================================================================
// src/pages/fpl/articles/HaalandCaptainArticle.tsx
//
// /fpl/articles/should-you-always-captain-haaland
// Figures: src/lib/fplArticles.ts (scripts/analysis/captaincy_*.sql).
// ============================================================================

import ArticleBarChart from '../../../components/articles/ArticleBarChart';
import ArticleLayout, { DataTable, H2, LINK, PROSE, StatRow } from '../../../components/articles/ArticleLayout';
import { Link } from 'react-router-dom';
import {
  CAPTAIN_ARTICLE,
  HAALAND_ARTICLE,
  HAALAND_BIG_AWAY,
  HAALAND_BY_CITY_GOALS,
  HAALAND_BY_RANK,
  HAALAND_CAPTAINCY,
  HAALAND_DISTRIBUTION,
  HAALAND_SEASONS,
  HAALAND_UPCOMING,
  HAALAND_VENUE,
  pct,
} from '../../../lib/fplArticles';

export function haalandSummary() {
  const starts = HAALAND_DISTRIBUTION.reduce((a, d) => a + d.starts, 0);
  const blanks = HAALAND_DISTRIBUTION.filter((d) => d.points <= 2).reduce((a, d) => a + d.starts, 0);
  const hauls = HAALAND_DISTRIBUTION.filter((d) => d.points >= 10).reduce((a, d) => a + d.starts, 0);
  const bigAwayPts = HAALAND_BIG_AWAY.reduce((a, g) => a + g.points, 0);
  const bigAwayBlanks = HAALAND_BIG_AWAY.filter((g) => g.points <= 2).length;
  const arsenal = HAALAND_BIG_AWAY.filter((g) => g.opponent === 'Arsenal');
  const always = HAALAND_CAPTAINCY.reduce((a, s) => a + s.alwaysHaaland, 0);
  const top = HAALAND_CAPTAINCY.reduce((a, s) => a + s.topRanked, 0);
  return {
    starts,
    blanks,
    hauls,
    bigAwayGames: HAALAND_BIG_AWAY.length,
    bigAwayAvg: bigAwayPts / HAALAND_BIG_AWAY.length,
    bigAwayBlanks,
    arsenal,
    always,
    top,
    cost: top - always,
  };
}

const BUCKETS: [string, number, number][] = [
  ['0–2', 0, 2],
  ['3–6', 3, 6],
  ['7–9', 7, 9],
  ['10–12', 10, 12],
  ['13–16', 13, 16],
  ['17 or more', 17, 99],
];

export default function HaalandCaptainArticle() {
  const s = haalandSummary();
  const [home, away] = HAALAND_VENUE;
  const top5Share = (x: (typeof HAALAND_SEASONS)[number]) => pct(x.top5 / x.points);
  const multiShare = (x: (typeof HAALAND_SEASONS)[number]) => pct(x.multiGoalPoints / x.points);
  const lowRank = HAALAND_BY_RANK[3];
  const top5Shares = HAALAND_SEASONS.map((x) => x.top5 / x.points);
  const top5Min = Math.min(...top5Shares);
  const top5Max = Math.max(...top5Shares);
  return (
    <ArticleLayout
      meta={HAALAND_ARTICLE}
      next={[
        { label: CAPTAIN_ARTICLE.title, to: CAPTAIN_ARTICLE.path },
        { label: 'This week’s expected points for every player', to: '/fpl/player-points' },
        { label: 'Haaland’s season-by-season record in Player Scout', to: '/fpl/player-scout' },
      ]}
      method={
        <>
          <p>
            Haaland&rsquo;s FPL points in every Premier League match from 2022/23 to 2025/26 ({s.starts} starts). City&rsquo;s expected goals for each match come from the closing betting market (average prices, margin removed). &ldquo;Blank&rdquo; means 2 points or fewer; &ldquo;haul&rdquo; 10 or more.
          </p>
          <p>
            The captaincy comparison uses the same method as <Link to={CAPTAIN_ARTICLE.path} className={LINK}>our captaincy article</Link>: gameweeks 3 to 38, candidates are the 20 most-owned players who started their last match, ranked by a simple pre-deadline estimate. &ldquo;Always Haaland&rdquo; captains him whenever he is a candidate and the top-ranked player otherwise (injured, dropped, or City without a fixture).
          </p>
        </>
      }
    >
      <StatRow
        stats={[
          { value: home.points.toFixed(1), label: 'points a start at home' },
          { value: away.points.toFixed(1), label: 'points a start away' },
          { value: pct(s.blanks / s.starts), label: 'of starts blanked (2 or fewer)' },
          { value: `−${s.cost}`, label: 'captain points from always picking him, four seasons' },
        ]}
      />

      <section aria-labelledby="shape-heading" className="space-y-3">
        <h2 id="shape-heading" className={H2}>Peaks and troughs</h2>
        <div className={PROSE}>
          <p>
            Haaland&rsquo;s scores bunch at both ends. Of his {s.starts} starts, {s.blanks} ended on 2 points or fewer and {s.hauls} on 10 or more. Much of his value arrives in a handful of games: his best five matches gave {pct(top5Min)}&ndash;{pct(top5Max)} of each season&rsquo;s total, and games where he scored twice or more, about one in five, gave between a third and a half of it.
          </p>
        </div>
        <ArticleBarChart
          title="Blank or haul: Haaland's points per start"
          valueLabel="Starts"
          format={(v) => String(v)}
          rows={BUCKETS.map(([label, lo, hi]) => ({
            label: `${label} points`,
            value: HAALAND_DISTRIBUTION.filter((d) => d.points >= lo && d.points <= hi).reduce((a, d) => a + d.starts, 0),
            highlight: lo >= 10,
          }))}
          takeaway="The tallest bar is the blank. The hauls on the right are what make him the most-captained player."
        />
        <DataTable
          caption="Haaland by season"
          head={['Season', 'Apps', 'Points', 'Best 5 games', 'Games with 2+ goals', 'Points from them', 'Blanks', 'Hauls']}
          rows={HAALAND_SEASONS.map((x) => [x.season, x.apps, x.points, `${x.top5} (${top5Share(x)})`, x.multiGoalGames, `${x.multiGoalPoints} (${multiShare(x)})`, x.blanks, x.hauls])}
        />
      </section>

      <section aria-labelledby="fixture-heading" className="space-y-3">
        <h2 id="fixture-heading" className={H2}>Where the hauls come from</h2>
        <div className={PROSE}>
          <p>
            At home he averaged {home.points.toFixed(1)} a start and hauled in {pct(home.haul)}; away, {away.points.toFixed(1)} and {pct(away.haul)}. The bigger split is how many goals City are expected to score. When the market priced City for 2.5 or more he averaged {HAALAND_BY_CITY_GOALS[3].points.toFixed(1)}; between 1.5 and 2.5, a little over 6.
          </p>
        </div>
        <ArticleBarChart
          title="More City goals expected, more Haaland points"
          valueLabel="Avg points a start"
          format={(v) => v.toFixed(1)}
          rows={HAALAND_BY_CITY_GOALS.map((b) => ({ label: `City ${b.band}`, value: b.points, highlight: b.band === '2.5 or more', note: `${b.starts} starts` }))}
          takeaway={`Only ${HAALAND_BY_CITY_GOALS[0].starts} starts came with City expected to score under 1.5, too few to read much into.`}
        />
        <DataTable
          caption="Haaland at home and away"
          head={['', 'Starts', 'Points', 'Goals', 'Blank', 'Haul', 'City goals expected']}
          rows={HAALAND_VENUE.map((v) => [v.venue, v.starts, v.points.toFixed(1), v.goals.toFixed(2), pct(v.blank), pct(v.haul), v.cityGoals.toFixed(2)])}
        />
      </section>

      <section aria-labelledby="away-heading" className="space-y-3">
        <h2 id="away-heading" className={H2}>Away at the big sides</h2>
        <div className={PROSE}>
          <p>
            Away at Arsenal, Liverpool, Chelsea, Tottenham, Manchester United and Newcastle he averaged {s.bigAwayAvg.toFixed(1)} points and blanked in {s.bigAwayBlanks} of {s.bigAwayGames} games. At Arsenal he scored {s.arsenal.map((g) => g.points).join(', ')}: a goal in three of the four, never more.
          </p>
        </div>
        <DataTable
          caption="Haaland away at the big sides"
          head={['Season', 'GW', 'Opponent', 'Points', 'Goals', 'City goals expected']}
          rows={HAALAND_BIG_AWAY.map((g) => [g.season, g.gw, g.opponent, g.points, g.goals, g.cityGoals.toFixed(2)])}
        />
      </section>

      <section aria-labelledby="armband-heading" className="space-y-3">
        <h2 id="armband-heading" className={H2}>What always captaining him cost</h2>
        <div className={PROSE}>
          <p>
            Always captaining Haaland scored {s.always} captain points over the four seasons; always taking the top-ranked player scored {s.top}. Almost all of the gap came in 2024/25, his weakest season, and in 2025/26 the two were level.
          </p>
          <p>
            The estimate tells you when to move off him. When it ranked him first to third, he outscored the best alternative. When it ranked him 4th or lower ({lowRank.weeks} weeks), the alternative averaged {lowRank.alternative.toFixed(1)} against his {lowRank.haaland.toFixed(1)}.
          </p>
        </div>
        <DataTable
          caption="Captain points: always Haaland against always the top-ranked"
          head={['Season', 'Always Haaland', 'Top-ranked', 'Difference']}
          rows={[
            ...HAALAND_CAPTAINCY.map((x) => [x.season, x.alwaysHaaland, x.topRanked, signed(x.alwaysHaaland - x.topRanked)]),
            ['All four', s.always, s.top, signed(s.always - s.top)],
          ]}
        />
        <DataTable
          caption="Haaland against the best alternative, by where the estimate ranked him"
          head={['Estimate ranked him', 'Weeks', 'Haaland', 'Best alternative']}
          rows={HAALAND_BY_RANK.map((r) => [r.rank, r.weeks, r.haaland.toFixed(1), r.alternative.toFixed(1)])}
        />
      </section>

      <section aria-labelledby="now-heading" className="space-y-2">
        <h2 id="now-heading" className={H2}>This season</h2>
        <div className={PROSE}>
          <p>
            City&rsquo;s two hardest away games coming up, with the market&rsquo;s expected City goals at 7 October: {HAALAND_UPCOMING.map((u, i) => (
              <span key={u.gw}>{i ? '; ' : ''}{u.fixture} (gameweek {u.gw}, {u.date}): {u.cityGoals.toFixed(2)}</span>
            ))}. Both are in the range where he has averaged about 6 points or fewer, and Arsenal away is lower than any of the 22 big away games above.
          </p>
        </div>
      </section>

      <section aria-labelledby="rule-heading" className="space-y-2">
        <h2 id="rule-heading" className={H2}>So should you captain him?</h2>
        <ul className="list-disc pl-5 text-ink-700 max-w-prose space-y-1">
          <li>At home, and whenever City are expected to score 2.5 or more: yes, he is the default.</li>
          <li>Away at the strongest sides: rank him like anyone else. If another player is clearly ahead on expected points, take him.</li>
          <li>Don&rsquo;t judge it on one week. Even in his best fixtures he blanks a quarter of the time.</li>
        </ul>
      </section>
    </ArticleLayout>
  );
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
}

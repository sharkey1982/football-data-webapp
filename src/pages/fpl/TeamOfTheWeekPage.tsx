// ============================================================================
// src/pages/fpl/TeamOfTheWeekPage.tsx
//
// The week's best XI, and an automatically-written read on how the model
// did against it.
//
// Written to stand on its own each week with no human input -- the
// commentary is generated from the numbers rather than composed. The
// honesty is the point: low overlap gets explained as variance rather
// than spun as either success or failure, because the perfect XI is made
// of outliers by construction and no projection targets those.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import {
  getTeamOfTheWeek,
  getTotwVsModel,
  getCompletedGameweeks,
  getGameweekScorers,
  type GameweekScorer,
  type TotwPlayer,
  type TotwComparison,
} from '../../lib/teamOfWeekApi';
import { layoutByBand } from '../../lib/pitchLayout';



/** The week's read, derived from the numbers rather than written. */
function verdict(c: TotwComparison): string {
  const gap = c.model_xi_actual_points - c.model_xi_projected;
  const calibration =
    Math.abs(gap) <= 5
      ? `The model's own XI returned ${c.model_xi_actual_points} points against a projection of ${c.model_xi_projected.toFixed(0)} — almost exactly what it expected.`
      : gap > 0
        ? `The model's own XI returned ${c.model_xi_actual_points} points against a projection of ${c.model_xi_projected.toFixed(0)}, beating its own forecast.`
        : `The model's own XI returned ${c.model_xi_actual_points} points against a projection of ${c.model_xi_projected.toFixed(0)}, falling short of its own forecast.`;

  const overlap =
    c.overlap_count === 0
      ? 'None of its picks made the perfect XI.'
      : c.overlap_count === 1
        ? 'One of its picks made the perfect XI.'
        : `${c.overlap_count} of its picks made the perfect XI.`;

  return `${calibration} ${overlap}`;
}

export default function TeamOfTheWeekPage() {
  // A gameweek in the URL makes every completed week its own page.
  // Each is a distinct, permanent record -- "GW4's best XI" doesn't
  // change once the week is done -- which is both what a reader wants to
  // link to and what a crawler can index. A single always-latest page
  // would have one URL whose content silently changes every week.
  const { gw: gwParam } = useParams<{ gw?: string }>();
  // URLs read /gw4, but React Router v6 has no partial dynamic segments
  // -- "gw:gw" matches nothing, which is why every gameweek except the
  // default rendered blank. The param is the whole segment and the "gw"
  // prefix is stripped here.
  const requestedGw = (() => {
    if (!gwParam) return undefined;
    const n = Number(gwParam.replace(/^gw/i, ''));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  })();
  const [xi, setXi] = useState<TotwPlayer[] | null>(null);
  const [cmp, setCmp] = useState<TotwComparison | null>(null);
  const [weeks, setWeeks] = useState<number[]>([]);
  const [scorers, setScorers] = useState<GameweekScorer[]>([]);
  // Kept as bare numbers: the selector only needs the id, and the
  // richer shape (points, best score) belongs to whatever shows a
  // gameweek index rather than this page's nav strip.

  useDocumentHead({
    title: requestedGw ? `FPL team of the week — gameweek ${requestedGw}` : 'FPL team of the week',
    description: requestedGw
      ? `The highest-scoring valid Fantasy Premier League XI of gameweek ${requestedGw}, and how it compares to the players the model rated highest.`
      : 'The highest-scoring valid Fantasy Premier League XI of the gameweek, and how it compares to the players the model rated highest.',
    path: requestedGw ? `/fpl/team-of-the-week/gw${requestedGw}` : '/fpl/team-of-the-week',
  });

  useEffect(() => {
    let live = true;
    Promise.all([getTeamOfTheWeek(requestedGw), getTotwVsModel(requestedGw)])
      .then(([a, b]) => {
        if (!live) return;
        setXi(a);
        setCmp(b);
        // Scorers need the resolved gameweek, which only the XI knows
        // when no gameweek was requested -- fetching them in parallel
        // would mean guessing the latest and sometimes guessing wrong.
        const gw = requestedGw ?? a[0]?.fpl_event_id;
        if (gw != null) {
          getGameweekScorers(gw)
            .then((s) => live && setScorers(s))
            .catch(() => live && setScorers([]));
        }
      })
      .catch(() => live && setXi([]));
    getCompletedGameweeks()
      .then((gws) => gws.map((g) => g.fpl_event_id))
      .then((w) => live && setWeeks(w))
      .catch(() => live && setWeeks([]));
    return () => {
      live = false;
    };
  }, [requestedGw]);

  if (xi === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (xi.length === 0) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Team of the week</h1>
        <p className="text-ink-700 mt-2">No completed gameweek data yet.</p>
      </div>
    );
  }

  const gw = xi[0].fpl_event_id;
  const total = xi.reduce((s, p) => s + p.points, 0);
  const placed = layoutByBand(xi, (p) => p.position_label);
  const maxPoints = Math.max(...xi.map((p) => p.points), 1);

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Team of the week &mdash; GW{gw}</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          The highest-scoring legal XI of gameweek {gw}, worth <strong>{total} points</strong>. Formation rules apply, so
          this is a side someone could actually have picked &mdash; not simply the eleven top scorers.
        </p>
        {weeks.length > 1 && (
          <nav aria-label="Gameweeks" className="flex flex-wrap gap-1.5 mt-3">
            {weeks.map((w) => (
              <Link
                key={w}
                to={`/fpl/team-of-the-week/gw${w}`}
                className={[
                  'text-xs rounded px-2.5 py-1 border transition-colors',
                  w === gw
                    ? 'bg-pitch-800 text-chalk-100 border-pitch-800'
                    : 'border-chalk-300 text-ink-700 hover:bg-chalk-200',
                ].join(' ')}
              >
                GW{w}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {cmp && (
        <section className="border border-chalk-300 rounded-lg bg-white p-4">
          <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">How the model did</h2>
          <p className="text-ink-900 mt-1 max-w-prose">{verdict(cmp)}</p>
          <p className="text-ink-500 text-sm mt-2 max-w-prose">
            Low overlap isn&rsquo;t a failing. The perfect XI is built from whoever happened to haul, and a projection is
            an average across outcomes rather than a bet on an explosion. Whether the model&rsquo;s own XI scored close to
            what it projected is the more telling number &mdash; that&rsquo;s the claim it actually makes.
          </p>
        </section>
      )}

      <section>
        {/* Laid out by FPL position, because that's all FPL records --
            a real position would be invented. The shape therefore falls
            out of the XI rather than being a formation. */}
        <div className="relative rounded-lg bg-pitch-800 border-2 border-pitch-600 aspect-[3/4] sm:aspect-[4/3] max-w-2xl overflow-hidden">
          <div className="absolute inset-x-0 top-1/2 border-t border-pitch-600/70" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border border-pitch-600/70" />
          <div className="absolute left-1/4 right-1/4 bottom-0 h-[18%] border-2 border-b-0 border-pitch-600/70" />
          <div className="absolute left-1/4 right-1/4 top-0 h-[18%] border-2 border-t-0 border-pitch-600/70" />

          {placed.map(({ item: p, x, y }) => (
            <div
              key={p.fpl_player_id}
              className="absolute -translate-x-1/2 translate-y-1/2 flex flex-col items-center w-20"
              style={{ left: `${x}%`, bottom: `${y}%` }}
            >
              <div
                className="rounded-full border-2 border-chalk-100 flex items-center justify-center shrink-0"
                style={{
                  width: 'clamp(2rem, 7vw, 2.6rem)',
                  height: 'clamp(2rem, 7vw, 2.6rem)',
                  // Shaded by score relative to the best in the XI, so
                  // the standout performers read at a glance.
                  backgroundColor: `rgba(227, 180, 85, ${0.25 + (p.points / maxPoints) * 0.75})`,
                }}
              >
                <span className="font-mono text-xs text-ink-900 font-medium tabular-nums">{p.points}</span>
              </div>
              <span className="text-[0.65rem] text-chalk-100 mt-0.5 text-center leading-tight truncate w-full">
                {p.slug ? (
                  <Link to={`/fpl/players/${p.slug}`} className="hover:text-amber-400">
                    {p.web_name}
                  </Link>
                ) : (
                  p.web_name
                )}
              </span>
              {/* The breakdown, not just the total: 12 points from two
                  goals reads very differently from 12 off a clean sheet
                  and three bonus, and without it each marker is
                  decorative. Zeros are omitted so a defender's marker
                  doesn't carry "0G 0A". */}
              <span className="text-[0.55rem] text-amber-400 font-mono truncate w-full text-center leading-tight">
                {[
                  p.goals > 0 ? `${p.goals}G` : null,
                  p.assists > 0 ? `${p.assists}A` : null,
                  p.clean_sheets > 0 ? 'CS' : null,
                  p.bonus > 0 ? `+${p.bonus}` : null,
                ]
                  .filter(Boolean)
                  .join(' ') || `${p.minutes}'`}
              </span>
              <span className="text-[0.55rem] text-chalk-300 truncate w-full text-center">{p.team_name}</span>
            </div>
          ))}
        </div>
      </section>

      {scorers.length > 0 && (
        <section>
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Everyone who scored</h2>
          <p className="text-ink-700 text-sm mt-1 max-w-prose">
            The full gameweek, not just the XI &mdash; including the players who just missed out, which is where the
            selection actually gets interesting.
          </p>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
              <thead className="bg-chalk-200 text-ink-500">
                <tr>
                  <th scope="col" className="text-left font-medium text-xs px-3 py-2">Player</th>
                  <th scope="col" className="text-right font-medium text-xs px-3 py-2">Points</th>
                  <th scope="col" className="text-right font-medium text-xs px-3 py-2">Mins</th>
                  <th scope="col" className="text-right font-medium text-xs px-3 py-2">G</th>
                  <th scope="col" className="text-right font-medium text-xs px-3 py-2">A</th>
                  <th scope="col" className="text-right font-medium text-xs px-3 py-2">CS</th>
                  <th scope="col" className="text-right font-medium text-xs px-3 py-2">Bonus</th>
                </tr>
              </thead>
              <tbody>
                {scorers.map((p, i) => {
                  const inXi = xi.some((x) => x.fpl_player_id === p.fpl_player_id);
                  return (
                    <tr
                      key={p.fpl_player_id}
                      className={[
                        i % 2 === 1 ? 'bg-chalk-100/60' : '',
                        // Marking the XI shows WHY someone missed out:
                        // usually a formation limit, not a lower score.
                        inXi ? 'font-medium' : '',
                      ].join(' ')}
                    >
                      <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">
                        {p.slug ? (
                          <Link to={`/fpl/players/${p.slug}`} className="text-pitch-800 underline underline-offset-2">
                            {p.web_name}
                          </Link>
                        ) : (
                          p.web_name
                        )}
                        {inXi && <span className="text-pitch-700 ml-1" title="In the team of the week">&#9733;</span>}
                      </th>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{p.points}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">{p.minutes}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{p.goals}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{p.assists}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{p.clean_sheets}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{p.bonus}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fpl/actual-matches" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Gameweek results
        </Link>
        <Link to="/fpl/value" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Points per million
        </Link>
      </nav>
    </article>
  );
}

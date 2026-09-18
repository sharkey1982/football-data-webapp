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
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { getTeamOfTheWeek, getTotwVsModel, type TotwPlayer, type TotwComparison } from '../../lib/teamOfWeekApi';

const POS_ORDER = ['GKP', 'DEF', 'MID', 'FWD'];

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
  const [xi, setXi] = useState<TotwPlayer[] | null>(null);
  const [cmp, setCmp] = useState<TotwComparison | null>(null);

  useDocumentHead({
    title: 'FPL team of the week',
    description:
      'The highest-scoring valid Fantasy Premier League XI of the gameweek, and how it compares to the players the model rated highest.',
    path: '/fpl/team-of-the-week',
  });

  useEffect(() => {
    Promise.all([getTeamOfTheWeek(), getTotwVsModel()])
      .then(([a, b]) => {
        setXi(a);
        setCmp(b);
      })
      .catch(() => setXi([]));
  }, []);

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
  const byPos = POS_ORDER.map((pos) => ({ pos, players: xi.filter((p) => p.position_label === pos) })).filter((g) => g.players.length);

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Team of the week &mdash; GW{gw}</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          The highest-scoring legal XI of gameweek {gw}, worth <strong>{total} points</strong>. Formation rules apply, so
          this is a side someone could actually have picked &mdash; not simply the eleven top scorers.
        </p>
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

      {byPos.map(({ pos, players }) => (
        <section key={pos}>
          <h2 className="font-display uppercase tracking-wide text-sm text-ink-500">{pos}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mt-2">
            {players.map((p) => (
              <div key={p.fpl_player_id} className="border border-chalk-300 rounded-lg bg-white p-3 flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900 truncate">
                    {p.slug ? (
                      <Link to={`/fpl/players/${p.slug}`} className="text-pitch-800 underline underline-offset-2">
                        {p.web_name}
                      </Link>
                    ) : (
                      p.web_name
                    )}
                  </p>
                  <p className="text-xs text-ink-500 truncate">{p.team_name}</p>
                </div>
                <span className="font-mono text-lg tabular-nums text-ink-900 shrink-0">{p.points}</span>
              </div>
            ))}
          </div>
        </section>
      ))}

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

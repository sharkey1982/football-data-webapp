// ============================================================================
// src/pages/fpl/SeasonXiPage.tsx
//
// The XI you could have picked in August 2025 and never touched.
//
// Discover, not Predict: this is what WAS possible, computed with
// complete hindsight. It makes no claim about the future.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import {
  getSeasonBestXi,
  getSeasonValueLeaders,
  getXiSeasons,
  seasonName,
  POS_LABEL,
  type SeasonXiPlayer,
  type SeasonValueLeader,
  type XiSeason,
} from '../../lib/seasonXiApi';
import { layoutByBand } from '../../lib/pitchLayout';

export default function SeasonXiPage() {
  const [xi, setXi] = useState<SeasonXiPlayer[] | null>(null);
  const [value, setValue] = useState<SeasonValueLeader[]>([]);
  const [seasons, setSeasons] = useState<XiSeason[]>([]);
  // Newest season selected once the list arrives, rather than a
  // hardcoded id -- adding a season should be an insert, not an edit.
  const [seasonId, setSeasonId] = useState<number | null>(null);

  const current = seasons.find((s) => s.season_id === seasonId);
  const label = current ? seasonName(current.slug) : '';

  useDocumentHead({
    title: label ? `The perfect FPL XI of ${label}` : 'The perfect FPL XI',
    description: `The highest-scoring Fantasy Premier League XI you could have picked before a ball was kicked and never changed, at start-of-season prices.`,
    path: '/fpl/season-xi',
  });

  useEffect(() => {
    getXiSeasons()
      .then((list) => {
        setSeasons(list);
        setSeasonId((cur) => cur ?? list[0]?.season_id ?? null);
      })
      .catch(() => setSeasons([]));
  }, []);

  useEffect(() => {
    if (seasonId == null) return;
    getSeasonBestXi(seasonId).then(setXi).catch(() => setXi([]));
    getSeasonValueLeaders(seasonId).then(setValue).catch(() => setValue([]));
  }, [seasonId]);

  if (xi === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (xi.length === 0) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">The set-and-forget XI</h1>
        <p className="text-ink-700 mt-2">No season data is available yet.</p>
      </div>
    );
  }

  const points = xi.reduce((s, p) => s + p.total_points, 0);
  const cost = xi.reduce((s, p) => s + p.start_cost, 0) / 10;
  const placed = layoutByBand(xi, (p) => POS_LABEL[p.element_type]);
  const maxPts = Math.max(...xi.map((p) => p.total_points), 1);

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">
          The set-and-forget XI{label && ` \u2014 ${label}`}
        </h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          The highest-scoring eleven you could have picked before a ball was kicked and never touched again:{' '}
          <strong>{points.toLocaleString()} points</strong> for <strong>&pound;{cost.toFixed(1)}m</strong>. No transfers,
          no chips, no hits.
        </p>
      </header>

      {seasons.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {seasons.map((s2) => (
            <button
              key={s2.season_id}
              type="button"
              onClick={() => setSeasonId(s2.season_id)}
              className={[
                'text-sm rounded px-3 py-1.5 border transition-colors',
                s2.season_id === seasonId
                  ? 'bg-pitch-800 text-chalk-100 border-pitch-800'
                  : 'border-chalk-300 text-ink-700 hover:bg-chalk-200',
              ].join(' ')}
            >
              {seasonName(s2.slug)}
            </button>
          ))}
        </div>
      )}

      {seasons.length > 1 && (
        <section className="border border-chalk-300 rounded-lg bg-white p-4">
          <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">The perfect XI barely changes price</h2>
          <p className="text-ink-700 text-sm mt-1 max-w-prose">
            Across {seasons.length} seasons the best possible eleven has cost between{' '}
            <strong>&pound;{(Math.min(...seasons.map((s2) => s2.cost)) / 10).toFixed(1)}m</strong> and{' '}
            <strong>&pound;{(Math.max(...seasons.map((s2) => s2.cost)) / 10).toFixed(1)}m</strong>, and scored between{' '}
            {Math.min(...seasons.map((s2) => s2.points)).toLocaleString()} and{' '}
            {Math.max(...seasons.map((s2) => s2.points)).toLocaleString()} points. The ceiling is remarkably steady.
          </p>
          <div className="space-y-1.5 mt-3">
            {seasons.map((s2) => {
              const mx = Math.max(...seasons.map((z) => z.points));
              return (
                <div key={s2.season_id} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 font-mono text-xs text-ink-700">{seasonName(s2.slug)}</span>
                  <div className="flex-1 bg-chalk-200 rounded h-4 overflow-hidden">
                    <div className="bg-pitch-700 h-full rounded" style={{ width: `${(s2.points / mx) * 100}%` }} />
                  </div>
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums">{s2.points}</span>
                  <span className="w-16 shrink-0 text-right font-mono text-[0.65rem] text-ink-500 tabular-nums">
                    &pound;{(s2.cost / 10).toFixed(1)}m
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="border border-chalk-300 rounded-lg bg-white p-4">
        <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">Why August prices matter</h2>
        <p className="text-ink-700 text-sm mt-1 max-w-prose">
          Every price here is what the player cost at the start of the season, not what he ended up worth. Gabriel
          finished at &pound;7.3m, but you&rsquo;d have paid <strong>&pound;6.0m</strong> &mdash; the higher price was
          created by the 209 points he then scored. Valuing a hindsight squad at closing prices lets you buy a player
          with money his own success generated, which is the one thing a real manager cannot do.
        </p>
      </section>

      <section>
        <div className="relative rounded-lg bg-pitch-800 border-2 border-pitch-600 aspect-[3/4] sm:aspect-[4/3] max-w-2xl overflow-hidden">
          <div className="absolute inset-x-0 top-1/2 border-t border-pitch-600/70" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border border-pitch-600/70" />
          <div className="absolute left-1/4 right-1/4 bottom-0 h-[18%] border-2 border-b-0 border-pitch-600/70" />
          <div className="absolute left-1/4 right-1/4 top-0 h-[18%] border-2 border-t-0 border-pitch-600/70" />
          {placed.map(({ item: p, x, y }) => (
            <div
              key={p.fpl_code}
              className="absolute -translate-x-1/2 translate-y-1/2 flex flex-col items-center w-20"
              style={{ left: `${x}%`, bottom: `${y}%` }}
            >
              <div
                className="rounded-full border-2 border-chalk-100 flex items-center justify-center shrink-0"
                style={{
                  width: 'clamp(2rem, 7vw, 2.6rem)',
                  height: 'clamp(2rem, 7vw, 2.6rem)',
                  backgroundColor: `rgba(227, 180, 85, ${0.3 + (p.total_points / maxPts) * 0.7})`,
                }}
              >
                <span className="font-mono text-[0.65rem] text-ink-900 font-medium tabular-nums">{p.total_points}</span>
              </div>
              <span className="text-[0.65rem] text-chalk-100 mt-0.5 text-center leading-tight truncate w-full">
                {p.web_name}
              </span>
              <span className="text-[0.55rem] text-amber-400 font-mono">&pound;{(p.start_cost / 10).toFixed(1)}m</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">The eleven</h2>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
            <thead className="bg-chalk-200 text-ink-500">
              <tr>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">Player</th>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">Pos</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">August price</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Points</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Per &pound;m</th>
              </tr>
            </thead>
            <tbody>
              {xi.map((p, i) => (
                <tr key={p.fpl_code} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                  <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">{p.web_name}</th>
                  <td className="px-3 py-1.5 text-xs text-ink-500">{POS_LABEL[p.element_type]}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                    &pound;{(p.start_cost / 10).toFixed(1)}m
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{p.total_points}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                    {(p.total_points / (p.start_cost / 10)).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {value.length > 0 && (
        <section>
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Best value of the season</h2>
          <p className="text-ink-700 text-sm mt-1 max-w-prose">
            Points per million at August prices, for anyone who played a reasonable share of the season.
          </p>
          <ul className="mt-2 space-y-1">
            {value.map((v) => (
              <li key={v.fpl_code} className="text-sm flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-ink-900">{v.web_name}</span>
                <span className="text-ink-500">{POS_LABEL[v.element_type]}</span>
                <span className="font-mono text-xs text-ink-900">
                  &pound;{(v.start_cost / 10).toFixed(1)}m &rarr; {v.total_points} pts
                </span>
                <span className="font-mono text-xs text-pitch-800 font-medium">{v.pointsPerStartMillion} per &pound;m</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-ink-500 text-xs max-w-prose">
        Budget of &pound;83.0m for the eleven, leaving roughly &pound;17m for a four-man bench, with the usual maximum of
        three players per club. This is the XI rather than a full fifteen: modelling bench autosubs would need
        gameweek-by-gameweek data, which isn&rsquo;t imported for past seasons.
      </p>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fpl/optimal-squad-so-far" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          This season&rsquo;s squad of the season
        </Link>
        <Link to="/fpl/value" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Bargain basement
        </Link>
      </nav>
    </article>
  );
}

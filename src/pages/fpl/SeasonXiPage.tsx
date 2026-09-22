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
  getRollingXiCandidates,
  solveRollingXi,
  type SolvedXi,
  getSeasonBestXi,
  getSeasonValueLeaders,
  getXiSeasons,
  getSeasonXiWeekly,
  seasonXiSpread,
  type SeasonXiWeek,
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
  // The season in progress: solved on read, because unlike a finished
  // season the answer changes every gameweek.
  const [rolling, setRolling] = useState<SolvedXi | null | 'loading'>('loading');
  // Newest season selected once the list arrives, rather than a
  // hardcoded id -- adding a season should be an insert, not an edit.
  const [seasonId, setSeasonId] = useState<number | null>(null);
  // Week by week for the chosen season's XI: eleven players, left alone.
  const [weekly, setWeekly] = useState<SeasonXiWeek[] | null>(null);

  const current = seasons.find((s) => s.season_id === seasonId);
  const label = current ? seasonName(current.slug) : '';

  useDocumentHead({
    title: label ? `The perfect FPL XI of ${label}` : 'The perfect FPL XI',
    description: `The highest-scoring Fantasy Premier League XI you could have picked before a ball was kicked and never changed, at start-of-season prices.`,
    path: '/fpl/season-xi',
  });

  useEffect(() => {
    getRollingXiCandidates(13)
      .then((pool) => setRolling(solveRollingXi(pool)))
      .catch(() => setRolling(null));
  }, []);

  useEffect(() => {
    getXiSeasons()
      .then((list) => {
        setSeasons(list);
        // Left null here: the effect below defaults to the season in
        // progress once the rolling XI has solved, falling back to the
        // most recent completed season if it can't.
        setSeasonId((cur) => cur ?? null);
      })
      .catch(() => setSeasons([]));
  }, []);

  // The season in progress is just another option in the selector. Its
  // XI is SOLVED rather than stored -- the answer moves every gameweek --
  // but it renders through exactly the same layout, so the page reads
  // the same whichever season is chosen.
  const CURRENT_SEASON_ID = 13;
  const allSeasons: XiSeason[] =
    rolling && rolling !== 'loading'
      ? [
          {
            season_id: CURRENT_SEASON_ID,
            slug: '2026-27',
            label: '2627',
            points: rolling.points,
            cost: rolling.cost,
          },
          ...seasons,
        ]
      : seasons;

  useEffect(() => {
    if (seasonId != null) return;
    if (rolling && rolling !== 'loading') setSeasonId(CURRENT_SEASON_ID);
    else if (seasons.length > 0) setSeasonId(seasons[0].season_id);
  }, [seasonId, rolling, seasons]);

  useEffect(() => {
    if (seasonId == null) return;
    if (seasonId === CURRENT_SEASON_ID) {
      if (rolling && rolling !== 'loading') {
        setXi(
          rolling.players.map((p) => ({
            season_id: CURRENT_SEASON_ID,
            fpl_code: p.fpl_code,
            web_name: p.web_name,
            team_name: p.team_name,
            element_type: p.element_type,
            start_cost: p.august_cost,
            total_points: p.total_points,
          }))
        );
      }
      getSeasonValueLeaders(CURRENT_SEASON_ID).then(setValue).catch(() => setValue([]));
      return;
    }
    getSeasonBestXi(seasonId).then(setXi).catch(() => setXi([]));
    getSeasonValueLeaders(seasonId).then(setValue).catch(() => setValue([]));
  }, [seasonId, rolling]);

  // Week by week for the chosen season. MUST sit with the other hooks, above
  // the early return below: placed after it, this never ran and the section
  // showed "Loading" for ever.
  useEffect(() => {
    if (seasonId === null || xi === null || xi.length === 0) { setWeekly(null); return; }
    let live = true;
    setWeekly(null);
    getSeasonXiWeekly(seasonId, xi.map((p) => p.fpl_code))
      .then((w) => live && setWeekly(w))
      .catch(() => live && setWeekly([]));
    return () => { live = false; };
  }, [seasonId, xi]);

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

      {allSeasons.length > 1 && (
        <section className="border border-chalk-300 rounded-lg bg-white p-4">
          <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">The perfect XI barely changes price</h2>
          <p className="text-ink-700 text-sm mt-1 max-w-prose">
            Across {allSeasons.length} seasons the best possible eleven has cost between{' '}
            <strong>&pound;{(Math.min(...allSeasons.map((s2) => s2.cost)) / 10).toFixed(1)}m</strong> and{' '}
            <strong>&pound;{(Math.max(...allSeasons.map((s2) => s2.cost)) / 10).toFixed(1)}m</strong>, and scored between{' '}
            {Math.min(...allSeasons.map((s2) => s2.points)).toLocaleString()} and{' '}
            {Math.max(...allSeasons.map((s2) => s2.points)).toLocaleString()} points. The ceiling is remarkably steady.
          </p>
          <div className="space-y-1.5 mt-3">
            {allSeasons.map((s2) => {
              const mx = Math.max(...allSeasons.map((z) => z.points));
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

      {allSeasons.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {allSeasons.map((s2) => (
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
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Week by week</h2>
        {weekly === null && <p className="text-sm text-ink-500 mt-2">Loading&hellip;</p>}
        {weekly !== null && weekly.length === 0 && (
          <p className="text-sm text-ink-500 mt-2">
            No weekly points for this season yet.
          </p>
        )}
        {weekly !== null && weekly.length > 0 && (() => {
          const spread = seasonXiSpread(weekly)!;
          const max = Math.max(...weekly.map((w) => w.total_points), 1);
          return (
            <>
              <p className="text-sm text-ink-500 mt-1">
                Eleven players, no captain, no substitutes &mdash; {spread.total} points across {spread.weeks} gameweeks.
              </p>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 mt-3">
                {[
                  ['Best week', `${spread.max}`, spread.bestWeek ? `GW${spread.bestWeek}` : ''],
                  ['Worst week', `${spread.min}`, spread.worstWeek ? `GW${spread.worstWeek}` : ''],
                  ['Average', spread.mean.toFixed(0), 'a week'],
                  ['Spread', `\u00b1${spread.stdDev.toFixed(0)}`, 'standard deviation'],
                ].map(([label, value, note]) => (
                  <div key={label} className="border border-chalk-300 rounded-lg bg-white p-2">
                    <div className="text-[11px] text-ink-500">{label}</div>
                    <div className="font-display text-xl text-ink-900">{value}</div>
                    <div className="text-[11px] text-ink-500">{note}</div>
                  </div>
                ))}
              </div>
              <div className="border border-chalk-300 rounded-lg bg-white p-3 mt-3 space-y-1">
                {weekly.map((w) => (
                  <div key={w.gameweek} className="flex items-center gap-2">
                    <span className="w-11 shrink-0 text-[11px] text-ink-500">GW{w.gameweek}</span>
                    <div className="flex-1 bg-chalk-100 rounded h-3.5 overflow-hidden">
                      <div
                        className={w.total_points >= spread.mean ? 'h-full bg-pitch-700' : 'h-full bg-pitch-600'}
                        style={{ width: `${(w.total_points / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-[11px] text-ink-700">{w.total_points}</span>
                    <span className="w-16 text-right text-[11px] text-ink-500">
                      {w.blanks > 0 ? `${w.blanks} blank${w.blanks === 1 ? '' : 's'}` : 'all played'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          );
        })()}
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

      <section className="border border-chalk-300 rounded-lg bg-white p-4">
        <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">Why August prices matter</h2>
        <p className="text-ink-700 text-sm mt-1 max-w-prose">
          Every price here is what the player cost at the start of that season, not what they ended up worth. A player
          who returns heavily gets more expensive because of it &mdash; so valuing a hindsight squad at closing prices
          lets it spend money its own success generated, which is the one thing a real manager cannot do.
        </p>
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

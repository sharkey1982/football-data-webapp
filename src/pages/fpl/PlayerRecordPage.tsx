// ============================================================================
// src/pages/fpl/PlayerRecordPage.tsx
//
// One player's ACTUAL record, several views of the same points:
// /fpl/player-scout/:slug
//
// Distinct from PlayerPage (/fpl/players/:slug), which is this season's
// PROJECTIONS. That one is what the model expects; this one is what
// happened, across every season held. The two link to each other rather
// than duplicating.
//
// Split out of PlayerScoutPage, which is now purely the browse list --
// they were one component holding two unrelated screens.
//
// Every figure is summed from that season's GAMEWEEK rows rather than
// read off a season total, so the contribution split, the cumulative
// line and the table cannot disagree. Checked against the database: all
// five of Saka's seasons reconcile to the point.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import PlayerCareerRecord from '../../components/fpl/PlayerCareerRecord';
import {
  getPlayerBySlug,
  getPlayerCareer,
  getPlayerSeasons,
  getPlayerSeasonGameweeks,
  seasonContributionTotals,
  cumulativePoints,
  seasonRates,
  actualContribution,
  seasonLabel,
  POSITION,
  SCOUT_CONTRIBUTION_COLUMNS,
  SCOUT_CONTRIBUTION_LABEL,
  type PlayerIdentity,
  type PlayerSeason,
  type PlayerSeasonOption,
  type SeasonGameweek,
  type GameweekBreakdown,
} from '../../lib/playerScoutApi';

/** Cumulative points across a season, as inline SVG. No charting
 * dependency: this codebase draws its pitch and sparklines by hand, and
 * a single line needs less than a library. */
function CumulativeChart({ points, label }: { points: { gameweek: number; total: number }[]; label: string }) {
  if (points.length < 2) return null;
  const W = 640;
  const H = 180;
  const PAD = { top: 10, right: 10, bottom: 22, left: 34 };
  const maxTotal = Math.max(...points.map((p) => p.total), 1);
  const maxGw = Math.max(...points.map((p) => p.gameweek), 1);
  const x = (gw: number) => PAD.left + ((gw - 1) / Math.max(maxGw - 1, 1)) * (W - PAD.left - PAD.right);
  const y = (t: number) => H - PAD.bottom - (t / maxTotal) * (H - PAD.top - PAD.bottom);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.gameweek).toFixed(1)} ${y(p.total).toFixed(1)}`).join(' ');
  const area = `${d} L ${x(points[points.length - 1].gameweek).toFixed(1)} ${H - PAD.bottom} L ${x(points[0].gameweek).toFixed(1)} ${H - PAD.bottom} Z`;
  const ticks = [0, Math.round(maxTotal / 2), maxTotal];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Cumulative points, ${label}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-chalk-300" strokeWidth={1} />
          <text x={PAD.left - 5} y={y(t) + 3} textAnchor="end" className="fill-ink-500" style={{ fontSize: 9 }}>
            {t}
          </text>
        </g>
      ))}
      <path d={area} className="fill-pitch-700/15" />
      <path d={d} className="stroke-pitch-800" strokeWidth={2} fill="none" />
      <text x={PAD.left} y={H - 6} className="fill-ink-500" style={{ fontSize: 9 }}>GW1</text>
      <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-ink-500" style={{ fontSize: 9 }}>
        GW{maxGw}
      </text>
    </svg>
  );
}

export default function PlayerRecordPage() {
  const { slug } = useParams<{ slug: string }>();
  const [player, setPlayer] = useState<PlayerIdentity | null>(null);
  const [seasons, setSeasons] = useState<PlayerSeasonOption[]>([]);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [gws, setGws] = useState<SeasonGameweek[]>([]);
  const [career, setCareer] = useState<PlayerSeason[]>([]);
  const [notFound, setNotFound] = useState(false);

  useDocumentHead({
    title: player ? `${player.canonical_name} — FPL record` : 'Player record',
    description: player
      ? `${player.canonical_name}'s Fantasy Premier League record: points by gameweek, what produced them, and how each season compares.`
      : 'A Fantasy Premier League player record.',
    path: `/fpl/player-scout/${slug ?? ''}`,
  });

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    getPlayerBySlug(slug)
      .then((p) => {
        if (cancelled) return;
        setPlayer(p);
        setNotFound(p === null);
        if (!p) return;
        getPlayerCareer(p.fpl_code).then((c) => !cancelled && setCareer(c)).catch(() => {});
        getPlayerSeasons(p.fpl_code)
          .then((ss) => {
            if (cancelled) return;
            setSeasons(ss);
            // Default to the CURRENT season where they have one, else
            // their most recent: a departed player should still open on
            // something rather than an empty selector.
            setSeasonId(ss.find((s) => s.is_current)?.season_id ?? ss[0]?.season_id ?? null);
          })
          .catch(() => {});
      })
      .catch(() => !cancelled && setNotFound(true));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!player || seasonId == null) return;
    let cancelled = false;
    getPlayerSeasonGameweeks(player.fpl_code, seasonId)
      .then((g) => !cancelled && setGws(g))
      .catch(() => !cancelled && setGws([]));
    return () => {
      cancelled = true;
    };
  }, [player, seasonId]);

  const contributions = useMemo(
    () => (player ? seasonContributionTotals(gws, player.element_type) : []),
    [gws, player]
  );
  const cumulative = useMemo(() => cumulativePoints(gws), [gws]);
  const rates = useMemo(() => seasonRates(gws), [gws]);
  const selected = seasons.find((s) => s.season_id === seasonId);

  if (notFound) {
    return (
      <article className="space-y-4">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Player not found</h1>
        <Link to="/fpl/player-scout" className="text-pitch-800 underline underline-offset-2 text-sm">
          Browse all players
        </Link>
      </article>
    );
  }
  if (!player) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;

  const departed = player.current_fpl_player_id == null;
  const contributionScale = contributions.reduce((s, c) => s + Math.abs(c.points), 0) || 1;

  return (
    <article className="space-y-6">
      <header>
        <Link to="/fpl/player-scout" className="text-sm text-pitch-800 underline underline-offset-2">
          &larr; All players
        </Link>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">{player.canonical_name}</h1>
        <p className="text-ink-500 text-sm">
          {POSITION[player.element_type]} &middot; {player.latest_team ?? 'unknown club'}
          {player.current_now_cost != null && <> &middot; &pound;{(player.current_now_cost / 10).toFixed(1)}m</>}
          {departed && <> &middot; no longer in the league</>}
        </p>
        <p className="text-ink-700 text-sm mt-2">
          <strong>{player.career_points}</strong> points across {player.seasons_played} season
          {player.seasons_played === 1 ? '' : 's'}
          {player.first_season && player.last_season && (
            <>
              {' '}
              &mdash; {seasonLabel(player.first_season)} to {seasonLabel(player.last_season)}
            </>
          )}
          .
        </p>
      </header>

      {seasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {seasons.map((s) => (
            <button
              key={s.season_id}
              type="button"
              onClick={() => setSeasonId(s.season_id)}
              className={[
                'px-3 py-1.5 text-sm rounded border transition-colors',
                s.season_id === seasonId
                  ? 'bg-pitch-800 text-chalk-100 border-pitch-800'
                  : 'bg-white text-ink-700 border-chalk-300 hover:bg-chalk-100',
              ].join(' ')}
            >
              {seasonLabel(s.season_slug)}
              {s.is_current && <span className="text-xs"> &middot; now</span>}
            </button>
          ))}
        </div>
      )}

      {gws.length === 0 ? (
        <p className="text-ink-500 text-sm">No gameweek detail held for this season.</p>
      ) : (
        <>
          <section>
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">
              {selected ? seasonLabel(selected.season_slug) : 'Season'} at a glance
            </h2>
            <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                ['Points', rates.points],
                ['Appearances', rates.appearances],
                ['Points per game', rates.pointsPerGame],
                ['Points per 90', rates.pointsPer90],
              ] as [string, number][]).map(([label, value]) => (
                <div key={label} className="border border-chalk-300 rounded-lg bg-white p-3">
                  <dt className="text-xs text-ink-500">{label}</dt>
                  <dd className="font-display text-xl text-ink-900">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-ink-500 text-xs mt-2 max-w-prose">
              Per game counts only matches they appeared in. Per 90 is the fairer comparison for anyone who often comes
              off the bench &mdash; {rates.minutesPerAppearance} minutes per appearance here.
            </p>
          </section>

          <section>
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Where the points came from</h2>
            <ul className="mt-2 space-y-1.5">
              {contributions.map((c) => (
                <li key={c.key} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-xs text-ink-700">{c.label}</span>
                  <div className="flex-1 bg-chalk-200 rounded h-4 overflow-hidden">
                    <div
                      className={c.points < 0 ? 'bg-loss-700 h-full' : 'bg-pitch-700 h-full'}
                      style={{ width: `${(Math.abs(c.points) / contributionScale) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 text-right font-mono text-xs tabular-nums">
                    {c.points > 0 ? '+' : ''}
                    {c.points}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-ink-500 text-xs mt-2 max-w-prose">
              Summed from this season&rsquo;s gameweeks using FPL&rsquo;s own scoring, so it reconciles with the table
              below rather than being a second estimate of the same thing.
            </p>
          </section>

          <section>
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Points as the season ran</h2>
            <p className="text-ink-700 text-sm mt-1 max-w-prose">
              The shape of a season rather than its endpoint &mdash; a flat stretch is an injury or a benching, a steep
              one is form.
            </p>
            <div className="border border-chalk-300 rounded-lg bg-white p-3 mt-2">
              <CumulativeChart points={cumulative} label={selected ? seasonLabel(selected.season_slug) : ''} />
            </div>
          </section>

          <section>
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Gameweek by gameweek</h2>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                <thead className="bg-chalk-200 text-ink-500">
                  <tr>
                    <th scope="col" className="text-left font-medium text-xs px-3 py-2">GW</th>
                    <th scope="col" className="text-left font-medium text-xs px-3 py-2">Opponent</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">Mins</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">Points</th>
                    {SCOUT_CONTRIBUTION_COLUMNS.map((c) => (
                      <th key={c} scope="col" className="text-right font-medium text-xs px-3 py-2 whitespace-nowrap">
                        {SCOUT_CONTRIBUTION_LABEL[c]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gws.map((g, i) => {
                    const c = actualContribution(g as unknown as GameweekBreakdown, player.element_type);
                    return (
                      <tr key={g.gameweek} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                        <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">GW{g.gameweek}</th>
                        <td className="px-3 py-1.5 text-xs text-ink-700 whitespace-nowrap">
                          {g.opponent ?? <span className="text-ink-500">&mdash;</span>}{' '}
                          <span className="text-ink-500">({g.was_home ? 'H' : 'A'})</span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">{g.minutes}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums font-medium">
                          {g.total_points}
                        </td>
                        {SCOUT_CONTRIBUTION_COLUMNS.map((key) => (
                          <td key={key} className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                            {c[key] === 0 ? <span className="text-ink-500">&ndash;</span> : c[key]}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {selected && !selected.is_current && (
              <p className="text-ink-500 text-xs mt-2 max-w-prose">
                Opponent names aren&rsquo;t held for past seasons, and own goals and penalties weren&rsquo;t imported, so
                a handful of rare events are missing from these rows.
              </p>
            )}
          </section>
        </>
      )}

      {/* Shared with the canonical player page -- one implementation,
          so the same player can't read differently in two places. */}
      <PlayerCareerRecord career={career} selectedSeasonId={seasonId} onSelectSeason={setSeasonId} />

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fpl/player-scout" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          All players
        </Link>
        {player.current_slug && (
          <Link
            to={`/fpl/players/${player.current_slug}`}
            className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2"
          >
            This season&rsquo;s projections
          </Link>
        )}
      </nav>
    </article>
  );
}

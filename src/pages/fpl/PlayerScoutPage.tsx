// ============================================================================
// src/pages/fpl/PlayerScoutPage.tsx
//
// Search any player, read what actually happened.
//
// Discover, not Predict: every figure here is a result. The projection
// counterpart lives in Predict, and the page links across rather than
// duplicating it.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import {
  searchPlayers,
  getPlayerCareer,
  seasonLabel,
  POSITION,
  type PlayerSearchResult,
  type PlayerSeason,
} from '../../lib/playerScoutApi';

function Phasing({ s }: { s: PlayerSeason }) {
  if (s.points_early == null && s.points_mid == null && s.points_late == null) {
    return <span className="text-ink-500 text-xs">&mdash;</span>;
  }
  const parts = [s.points_early ?? 0, s.points_mid ?? 0, s.points_late ?? 0];
  const max = Math.max(...parts, 1);
  return (
    <div className="flex items-end gap-0.5 h-6" title="Points by third of the season">
      {parts.map((p, i) => (
        <div
          key={i}
          className="w-2.5 bg-pitch-700 rounded-sm"
          style={{ height: `${Math.max(8, (p / max) * 100)}%` }}
          aria-label={`${['first', 'middle', 'final'][i]} third: ${p} points`}
        />
      ))}
    </div>
  );
}

export default function PlayerScoutPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [selected, setSelected] = useState<PlayerSearchResult | null>(null);
  const [career, setCareer] = useState<PlayerSeason[]>([]);
  const [searching, setSearching] = useState(false);

  useDocumentHead({
    title: 'Player Scout — every FPL player’s history',
    description:
      'Search any Fantasy Premier League player and see their season-by-season points, price, returns and form across multiple seasons.',
    path: '/fpl/player-scout',
  });

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    // Debounced: a query per keystroke would be a request per keystroke.
    const t = setTimeout(() => {
      searchPlayers(query)
        .then((r) => {
          if (!cancelled) setResults(r);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  useEffect(() => {
    if (!selected) {
      setCareer([]);
      return;
    }
    getPlayerCareer(selected.fpl_code)
      .then(setCareer)
      .catch(() => setCareer([]));
  }, [selected]);

  const careerTotals = useMemo(() => {
    if (career.length === 0) return null;
    return {
      points: career.reduce((s, c) => s + c.total_points, 0),
      minutes: career.reduce((s, c) => s + c.minutes, 0),
      goals: career.reduce((s, c) => s + c.goals_scored, 0),
      assists: career.reduce((s, c) => s + c.assists, 0),
      best: career.reduce((a, b) => (a.total_points >= b.total_points ? a : b)),
    };
  }, [career]);

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Player Scout</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Any player, season by season: what they cost, what they returned, and when in the season they did it. All
          results &mdash; no projections.
        </p>
      </header>

      <label className="block max-w-sm">
        <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Search by name</span>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="Saka, Haaland, Gabriel…"
          className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm"
        />
      </label>

      {query.trim().length >= 2 && !selected && (
        <section>
          {searching && results.length === 0 && <p className="text-ink-500 text-sm">Searching&hellip;</p>}
          {!searching && results.length === 0 && (
            <p className="text-ink-500 text-sm">
              No player matches that name in the seasons held here.
            </p>
          )}
          <ul className="space-y-1.5">
            {results.map((r) => (
              <li key={r.fpl_code}>
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className="w-full text-left border border-chalk-300 rounded-lg bg-white p-3 hover:bg-chalk-100 transition-colors"
                >
                  <span className="text-sm font-medium text-ink-900">{r.canonical_name}</span>{' '}
                  <span className="text-ink-500 text-xs">
                    {POSITION[r.element_type]} &middot; {r.latest_team ?? 'unknown club'}
                  </span>
                  <span className="block text-xs text-ink-500 mt-0.5 font-mono">
                    {r.career_points} pts over {r.seasons_played} season{r.seasons_played === 1 ? '' : 's'}
                    {r.first_season && r.last_season && (
                      <>
                        {' '}
                        &middot; {seasonLabel(r.first_season)}
                        {r.first_season !== r.last_season && <>&ndash;{seasonLabel(r.last_season)}</>}
                      </>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected && (
        <>
          <section className="border border-chalk-300 rounded-lg bg-white p-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">{selected.canonical_name}</h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-sm text-pitch-800 underline underline-offset-2"
              >
                Search again
              </button>
            </div>
            {careerTotals && (
              <p className="text-ink-700 text-sm mt-1 max-w-prose">
                <strong>{careerTotals.points}</strong> points across {career.length} season
                {career.length === 1 ? '' : 's'} &mdash; {careerTotals.goals} goals, {careerTotals.assists} assists in{' '}
                {careerTotals.minutes.toLocaleString()} minutes. Best season:{' '}
                <strong>{seasonLabel(careerTotals.best.season_slug)}</strong> on {careerTotals.best.total_points}.
              </p>
            )}
            {selected.current_slug ? (
              <p className="text-sm mt-2">
                <Link
                  to={`/fpl/players/${selected.current_slug}`}
                  className="text-pitch-800 underline underline-offset-2"
                >
                  See this season&rsquo;s projections
                </Link>
              </p>
            ) : (
              <p className="text-ink-500 text-xs mt-2">
                Not in the current Premier League squad, so there are no projections for them.
              </p>
            )}
          </section>

          <section>
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Season by season</h2>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                <thead className="bg-chalk-200 text-ink-500">
                  <tr>
                    <th scope="col" className="text-left font-medium text-xs px-3 py-2">Season</th>
                    <th scope="col" className="text-left font-medium text-xs px-3 py-2">Club</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">Aug price</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">Points</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">Per &pound;m</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">Mins</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">G</th>
                    <th scope="col" className="text-right font-medium text-xs px-3 py-2">A</th>
                    <th scope="col" className="text-left font-medium text-xs px-3 py-2">Shape</th>
                  </tr>
                </thead>
                <tbody>
                  {career.map((c, i) => (
                    <tr key={c.season_id} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                      <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">
                        {seasonLabel(c.season_slug)}
                      </th>
                      <td className="px-3 py-1.5 text-xs text-ink-700">{c.team_name ?? '\u2014'}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                        &pound;{(c.start_cost / 10).toFixed(1)}m
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums font-medium">
                        {c.total_points}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                        {c.points_per_start_million ?? '\u2014'}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">{c.minutes}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{c.goals_scored}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{c.assists}</td>
                      <td className="px-3 py-1.5"><Phasing s={c} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-ink-500 text-xs mt-2 max-w-prose">
              &ldquo;Shape&rdquo; splits the season into thirds, so a player who front-loaded reads differently from one
              who finished strongly. Price is what they cost in August, not what the season made them worth.
            </p>
          </section>
        </>
      )}

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fpl/player-points" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Player projections
        </Link>
        <Link to="/fpl/value" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Bargain basement
        </Link>
      </nav>
    </article>
  );
}

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
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import {
  listScoutPlayers,
  getPlayerGameweekBreakdown,
  actualContribution,
  SCOUT_CONTRIBUTION_COLUMNS,
  SCOUT_CONTRIBUTION_LABEL,
  getPlayerCareer,
  getPlayerBySlug,
  seasonLabel,
  POSITION,
  type PlayerSeason,
  type PlayerIdentity,
  type ScoutListPlayer,
  type GameweekBreakdown,
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
  // A slug in the URL makes the page linkable, shareable and
  // indexable -- the whole point of the identity slug. Without one the
  // page is search-only and invisible to a crawler.
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PlayerIdentity | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [list, setList] = useState<ScoutListPlayer[] | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [minMinutes, setMinMinutes] = useState(0);
  const [breakdown, setBreakdown] = useState<GameweekBreakdown[]>([]);
  const [selectedListPlayer, setSelectedListPlayer] = useState<ScoutListPlayer | null>(null);
  const [showCareer, setShowCareer] = useState(false);
  const [career, setCareer] = useState<PlayerSeason[]>([]);

  const headName = selected?.canonical_name;
  useDocumentHead({
    title: headName ? `${headName} — FPL career record` : 'Player Scout — every FPL player’s history',
    description: headName
      ? `${headName}'s season-by-season Fantasy Premier League record: points, price, goals, assists and form across every season held.`
      : 'Search any Fantasy Premier League player and see their season-by-season points, price, returns and form across multiple seasons.',
    path: slug ? `/fpl/player-scout/${slug}` : '/fpl/player-scout',
  });

  // Direct visit to a player URL resolves without a search.
  useEffect(() => {
    if (!slug) {
      setNotFound(false);
      return;
    }
    let cancelled = false;
    getPlayerBySlug(slug)
      .then((p) => {
        if (cancelled) return;
        setSelected(p);
        setNotFound(p === null);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);


  // The browse list is the default view: this season's players, filtered
  // server-side. Search narrows the same list rather than replacing it.
  useEffect(() => {
    let cancelled = false;
    listScoutPlayers({ position, minMinutes, search: query, limit: 150 })
      .then((r) => {
        if (!cancelled) setList(r);
      })
      .catch(() => {
        if (!cancelled) setList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [position, minMinutes, query]);

  // Current-season gameweek detail is the main event once a player is
  // chosen; career history sits behind a toggle.
  useEffect(() => {
    const id = selectedListPlayer?.fpl_player_id;
    if (id == null) {
      setBreakdown([]);
      return;
    }
    getPlayerGameweekBreakdown(id).then(setBreakdown).catch(() => setBreakdown([]));
  }, [selectedListPlayer]);

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

      {notFound && (
        <p className="text-ink-700 text-sm">
          No player at that address. Try searching by name.
        </p>
      )}

      {/* Filters + browse list. This is the DEFAULT view -- a
          search-only page assumed you already knew the name you wanted,
          which is the opposite of scouting. */}
      {!selectedListPlayer && (
        <>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <span className="block text-xs font-mono uppercase tracking-widest text-ink-500 mb-1">Position</span>
              <div className="flex flex-wrap gap-1.5">
                {([[null, 'All'], [1, 'GKP'], [2, 'DEF'], [3, 'MID'], [4, 'FWD']] as [number | null, string][]).map(
                  ([val, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setPosition(val)}
                      className={[
                        'px-3 py-1.5 text-sm rounded border transition-colors',
                        position === val
                          ? 'bg-pitch-800 text-chalk-100 border-pitch-800'
                          : 'bg-white text-ink-700 border-chalk-300 hover:bg-chalk-100',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
            </div>
            <div>
              <span className="block text-xs font-mono uppercase tracking-widest text-ink-500 mb-1">Minutes played</span>
              <div className="flex flex-wrap gap-1.5">
                {([[0, 'Any'], [90, '90+'], [450, '450+'], [900, '900+']] as [number, string][]).map(([val, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setMinMinutes(val)}
                    className={[
                      'px-3 py-1.5 text-sm rounded border transition-colors',
                      minMinutes === val
                        ? 'bg-pitch-800 text-chalk-100 border-pitch-800'
                        : 'bg-white text-ink-700 border-chalk-300 hover:bg-chalk-100',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <section>
            {list === null && <p className="text-ink-500 text-sm">Loading players&hellip;</p>}
            {list !== null && list.length === 0 && (
              <p className="text-ink-500 text-sm">No player in this season matches those filters.</p>
            )}
            {list !== null && list.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                  <thead className="bg-chalk-200 text-ink-500">
                    <tr>
                      <th scope="col" className="text-left font-medium text-xs px-3 py-2">Player</th>
                      <th scope="col" className="text-left font-medium text-xs px-3 py-2">Club</th>
                      <th scope="col" className="text-right font-medium text-xs px-3 py-2">Price</th>
                      <th scope="col" className="text-right font-medium text-xs px-3 py-2">Points</th>
                      <th scope="col" className="text-right font-medium text-xs px-3 py-2">Mins</th>
                      <th scope="col" className="text-right font-medium text-xs px-3 py-2">Per &pound;m</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p, i) => (
                      <tr
                        key={p.fpl_code}
                        className={[
                          'cursor-pointer hover:bg-chalk-200/70',
                          i % 2 === 1 ? 'bg-chalk-100/60' : '',
                        ].join(' ')}
                        onClick={() => setSelectedListPlayer(p)}
                      >
                        <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">
                          {p.web_name}{' '}
                          <span className="text-ink-500">{POSITION[p.element_type]}</span>
                        </th>
                        <td className="px-3 py-1.5 text-xs text-ink-700">{p.team_name ?? '\u2014'}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                          {p.now_cost != null ? `\u00a3${(p.now_cost / 10).toFixed(1)}m` : '\u2014'}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums font-medium">{p.total_points}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">{p.minutes}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{p.points_per_million ?? '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* A player chosen from the list: CURRENT-season actuals lead,
          because that's the question people actually arrive with.
          Career history sits behind a toggle rather than competing
          with it. */}
      {selectedListPlayer && (
        <>
          <section className="border border-chalk-300 rounded-lg bg-white p-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">
                  {selectedListPlayer.full_name || selectedListPlayer.web_name}
                </h2>
                <p className="text-ink-500 text-xs">
                  {POSITION[selectedListPlayer.element_type]} &middot; {selectedListPlayer.team_name ?? 'unknown club'}
                  {selectedListPlayer.now_cost != null && <> &middot; &pound;{(selectedListPlayer.now_cost / 10).toFixed(1)}m</>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedListPlayer(null);
                  setShowCareer(false);
                }}
                className="text-sm text-pitch-800 underline underline-offset-2"
              >
                Back to all players
              </button>
            </div>
            <p className="text-ink-700 text-sm mt-2">
              <strong>{selectedListPlayer.total_points}</strong> points this season from{' '}
              {selectedListPlayer.minutes.toLocaleString()} minutes &mdash; {selectedListPlayer.goals_scored} goals,{' '}
              {selectedListPlayer.assists} assists, {selectedListPlayer.bonus} bonus.
            </p>
          </section>

          <section>
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Gameweek by gameweek</h2>
            {breakdown.length === 0 ? (
              <p className="text-ink-500 text-sm mt-1">No gameweek data for this player yet.</p>
            ) : (
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                  <thead className="bg-chalk-200 text-ink-500">
                    <tr>
                      <th scope="col" className="text-left font-medium text-xs px-3 py-2">GW</th>
                      <th scope="col" className="text-left font-medium text-xs px-3 py-2">Opponent</th>
                      <th scope="col" className="text-right font-medium text-xs px-3 py-2">Mins</th>
                      <th scope="col" className="text-right font-medium text-xs px-3 py-2">Points</th>
                      <th scope="col" className="text-right font-medium text-xs px-3 py-2">Projected</th>
                      {SCOUT_CONTRIBUTION_COLUMNS.map((c) => (
                        <th key={c} scope="col" className="text-right font-medium text-xs px-3 py-2 whitespace-nowrap">
                          {SCOUT_CONTRIBUTION_LABEL[c]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((g, i) => {
                      const c = actualContribution(g, selectedListPlayer.element_type);
                      return (
                        <tr key={g.gameweek} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                          <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">GW{g.gameweek}</th>
                          <td className="px-3 py-1.5 text-xs text-ink-700 whitespace-nowrap">
                            {g.opponent ?? '\u2014'} <span className="text-ink-500">({g.was_home ? 'H' : 'A'})</span>
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">{g.minutes}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums font-medium">{g.total_points}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">
                            {/* Only a genuine PRE-KICKOFF projection. Most
                                early gameweeks have none: projections began
                                partway through the season, and anything
                                generated after kickoff isn't a forecast. */}
                            {g.projected_points ?? '\u2014'}
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
            )}
          </section>

          {selectedListPlayer.seasons_played > 0 && selectedListPlayer.slug && (
            <section>
              <button
                type="button"
                onClick={() => {
                  setShowCareer((v) => !v);
                  if (!showCareer && selectedListPlayer.slug) navigate(`/fpl/player-scout/${selectedListPlayer.slug}`);
                }}
                className="text-sm text-pitch-800 underline underline-offset-2"
              >
                {showCareer ? 'Hide' : 'Show'} earlier seasons ({selectedListPlayer.seasons_played})
              </button>
            </section>
          )}
        </>
      )}

      {selected && (
        <>
          <section className="border border-chalk-300 rounded-lg bg-white p-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">{selected.canonical_name}</h2>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  navigate('/fpl/player-scout');
                }}
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

// ============================================================================
// src/pages/fpl/SetPiecesPage.tsx
//
// Who takes the set pieces, by club.
//
// Pure Discover: what the duty IS, not who we think will score from it.
// Penalties lead because they're worth the most and are the reason most
// people open a page like this.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import {
  getSetPieceTakers,
  getSetPieceShare,
  SET_PIECE_TYPES,
  type SetPieceTaker,
  type SetPieceShare,
} from '../../lib/setPieceApi';

export default function SetPiecesPage() {
  const [takers, setTakers] = useState<SetPieceTaker[] | null>(null);
  const [typeKey, setTypeKey] = useState(SET_PIECE_TYPES[0].key);
  const [teamFilter, setTeamFilter] = useState('All');
  const [firstChoiceOnly, setFirstChoiceOnly] = useState(false);
  const [share, setShare] = useState<SetPieceShare | null>(null);
  const [playerQuery, setPlayerQuery] = useState('');

  useDocumentHead({
    title: 'Who takes the set pieces?',
    description:
      'Penalty, free-kick and corner takers for every Premier League club, ranked in order of duty.',
    path: '/fpl/set-pieces',
  });

  useEffect(() => {
    getSetPieceTakers(13)
      .then(setTakers)
      .catch(() => setTakers([]));
    getSetPieceShare()
      .then(setShare)
      .catch(() => setShare(null));
  }, []);

  const byTeam = useMemo(() => {
    if (!takers) return [];
    const filtered = takers.filter(
      (t) =>
        t.set_piece_type === typeKey &&
        (teamFilter === 'All' || t.team_name === teamFilter) &&
        (!firstChoiceOnly || t.rank === 1)
    );
    const map = new Map<string, SetPieceTaker[]>();
    for (const t of filtered) {
      if (!map.has(t.team_name)) map.set(t.team_name, []);
      map.get(t.team_name)!.push(t);
    }
    return [...map.entries()]
      .map(([team, list]) => ({ team, slug: list[0].team_slug, list: [...list].sort((a, b) => a.rank - b.rank) }))
      .sort((a, b) => a.team.localeCompare(b.team));
  }, [takers, typeKey, teamFilter, firstChoiceOnly]);

  // Player search cuts ACROSS set-piece types -- the question is "what
  // does this player take", and answering it type-by-type would make a
  // manager click through five tabs to assemble one answer.
  const playerMatches = useMemo(() => {
    if (!takers || playerQuery.trim().length < 2) return [];
    const q = playerQuery.trim().toLowerCase();
    const hits = takers.filter((t) => t.player_name.toLowerCase().includes(q));
    const byPlayer = new Map<string, typeof hits>();
    for (const h of hits) {
      const key = `${h.player_name}|${h.team_name}`;
      if (!byPlayer.has(key)) byPlayer.set(key, []);
      byPlayer.get(key)!.push(h);
    }
    return [...byPlayer.entries()]
      .map(([key, list]) => ({
        name: key.split('|')[0],
        team: list[0].team_name,
        duties: list.slice().sort((a, b) => a.rank - b.rank),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [takers, playerQuery]);

  const teams = useMemo(() => {
    if (!takers) return [];
    return [...new Set(takers.map((t) => t.team_name))].sort();
  }, [takers]);

  const lastUpdated = useMemo(() => {
    if (!takers || takers.length === 0) return null;
    return takers.map((t) => t.updated_at).filter(Boolean).sort().at(-1) ?? null;
  }, [takers]);

  if (takers === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (takers.length === 0) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Set-piece takers</h1>
        <p className="text-ink-700 mt-2">No set-piece data is available right now.</p>
      </div>
    );
  }

  const activeLabel = SET_PIECE_TYPES.find((t) => t.key === typeKey)?.label ?? '';

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Who takes the set pieces?</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Penalty, free-kick and corner duty for every Premier League club, ranked in order. Set-piece duty is one of the
          biggest single swings in a player&rsquo;s fantasy value, and it changes more often than most lists reflect.
        </p>
        {lastUpdated && (
          <p className="text-xs text-ink-500 font-mono mt-2">
            Updated <time dateTime={lastUpdated}>{new Date(lastUpdated).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
          </p>
        )}
      </header>

      <section>
        <label className="block max-w-sm">
          <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Find a player</span>
          <input
            type="search"
            value={playerQuery}
            onChange={(e) => setPlayerQuery(e.target.value)}
            placeholder="Every duty they take, in one view"
            className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm"
          />
        </label>
        {playerQuery.trim().length >= 2 && (
          <div className="mt-3 space-y-2">
            {playerMatches.length === 0 && <p className="text-sm text-ink-500">No set-piece duty recorded for that name.</p>}
            {playerMatches.map((p) => (
              <div key={`${p.name}-${p.team}`} className="border border-chalk-300 rounded-lg bg-white p-3">
                <p className="text-sm font-medium text-ink-900">
                  {p.name} <span className="text-ink-500 font-normal">{p.team}</span>
                </p>
                <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {p.duties.map((d) => (
                    <li key={d.set_piece_type} className="text-xs text-ink-700">
                      {SET_PIECE_TYPES.find((t) => t.key === d.set_piece_type)?.label ?? d.set_piece_type}
                      <span className="text-ink-500"> &mdash; #{d.rank}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Club</span>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="mt-1 border border-chalk-300 rounded px-3 py-2 text-sm bg-white"
          >
            <option value="All">All clubs</option>
            {teams.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input
            type="checkbox"
            checked={firstChoiceOnly}
            onChange={(e) => setFirstChoiceOnly(e.target.checked)}
            className="rounded border-chalk-300"
          />
          First choice only
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {SET_PIECE_TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTypeKey(t.key)}
            className={[
              'text-sm rounded px-3 py-1.5 border transition-colors',
              t.key === typeKey ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'border-chalk-300 text-ink-700 hover:bg-chalk-200',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">{activeLabel}</h2>
        {byTeam.length === 0 ? (
          <p className="text-ink-500 text-sm mt-2">No {activeLabel.toLowerCase()} recorded.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-3">
            {byTeam.map(({ team, slug, list }) => (
              <div key={team} className="border border-chalk-300 rounded-lg bg-white p-3">
                <h3 className="font-display uppercase tracking-wide text-sm text-ink-900">
                  {slug ? (
                    <Link to={`/football/teams/${slug}`} className="text-pitch-800 underline underline-offset-2">
                      {team}
                    </Link>
                  ) : (
                    team
                  )}
                </h3>
                <ol className="mt-1 space-y-0.5">
                  {list.map((t) => (
                    <li key={`${t.player_name}-${t.rank}`} className="text-sm flex items-baseline gap-2">
                      <span className="font-mono text-xs text-ink-500 tabular-nums w-4 shrink-0">{t.rank}</span>
                      <span className="text-ink-900">{t.player_name}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>

      {share && (
        <section className="border border-chalk-300 rounded-lg bg-white p-4">
          <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">Why set pieces matter</h2>
          <p className="text-ink-900 mt-1 max-w-prose">
            Across a full Premier League season of Opta data,{' '}
            <strong>{share.pct_goals_from_set_pieces.toFixed(1)}% of goals</strong> and{' '}
            <strong>{share.pct_assists_from_set_pieces.toFixed(1)}% of assists</strong> came from set pieces rather than
            open play. Taking duty is close to half of all assist output.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 mt-3">
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-ink-500">Goals</p>
              <div className="flex h-5 rounded overflow-hidden mt-1">
                <div className="bg-pitch-700" style={{ width: `${100 - share.pct_goals_from_set_pieces}%` }} />
                <div className="bg-amber-500" style={{ width: `${share.pct_goals_from_set_pieces}%` }} />
              </div>
              <p className="text-xs text-ink-500 mt-1">
                {share.open_play_goals.toFixed(0)} open play &middot; {share.set_piece_goals.toFixed(0)} set piece
              </p>
            </div>
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-ink-500">Assists</p>
              <div className="flex h-5 rounded overflow-hidden mt-1">
                <div className="bg-pitch-700" style={{ width: `${100 - share.pct_assists_from_set_pieces}%` }} />
                <div className="bg-amber-500" style={{ width: `${share.pct_assists_from_set_pieces}%` }} />
              </div>
              <p className="text-xs text-ink-500 mt-1">
                {(share.assists - share.set_piece_assists).toFixed(0)} open play &middot;{' '}
                {share.set_piece_assists.toFixed(0)} set piece
              </p>
            </div>
          </div>
          <p className="text-ink-500 text-xs mt-3 max-w-prose">
            Set-piece goals include penalties. This dataset records open-play and set-piece totals but not a breakdown by
            type, so penalties can&rsquo;t be separated from free kicks, or corners from direct free kicks &mdash;
            splitting the totals by assumed ratios would be inventing the answer.
          </p>
        </section>
      )}

      <p className="text-ink-500 text-xs max-w-prose">
        Order reflects observed duty, not a guarantee &mdash; managers rotate takers, and a first-choice penalty taker can
        hand one over on the day.
      </p>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fpl/start/discover" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          More to discover
        </Link>
        <Link to="/fpl/market" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          The FPL market
        </Link>
      </nav>
    </article>
  );
}

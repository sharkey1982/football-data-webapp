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
  getSetPieceBreakdown,
  getSetPieceIndex,
  type SetPieceIndexRow,
  goalSplit,
  assistSplit,
  SET_PIECE_TYPES,
  type SetPieceTaker,
  type SetPieceBreakdown,
} from '../../lib/setPieceApi';

export default function SetPiecesPage() {
  const [takers, setTakers] = useState<SetPieceTaker[] | null>(null);
  // Multi-select: a club's duties are more useful read together than
  // tabbed apart -- knowing who takes the penalties AND the corners is
  // one question, not four. Defaults to all types on.
  const [activeTypes, setActiveTypes] = useState<string[]>(SET_PIECE_TYPES.map((t) => t.key));
  const [teamFilter, setTeamFilter] = useState('All');
  const [firstChoiceOnly, setFirstChoiceOnly] = useState(false);
  const [share, setShare] = useState<SetPieceBreakdown | null>(null);
  const [index, setIndex] = useState<SetPieceIndexRow[]>([]);
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
    getSetPieceBreakdown()
      .then(setShare)
      .catch(() => setShare(null));
    getSetPieceIndex(13)
      .then(setIndex)
      .catch(() => setIndex([]));
  }, []);

  const byTeam = useMemo(() => {
    if (!takers) return [];
    const filtered = takers.filter(
      (t) =>
        activeTypes.includes(t.set_piece_type) &&
        (teamFilter === 'All' || t.team_name === teamFilter) &&
        (!firstChoiceOnly || t.rank === 1)
    );
    const map = new Map<string, SetPieceTaker[]>();
    for (const t of filtered) {
      if (!map.has(t.team_name)) map.set(t.team_name, []);
      map.get(t.team_name)!.push(t);
    }
    return [...map.entries()]
      .map(([team, list]) => ({
        team,
        slug: list[0].team_slug,
        // Grouped by duty within the club, in the display order defined
        // by SET_PIECE_TYPES (penalties first -- worth the most).
        groups: SET_PIECE_TYPES.filter((ty) => activeTypes.includes(ty.key))
          .map((ty) => ({
            label: ty.label,
            takers: list.filter((t) => t.set_piece_type === ty.key).sort((a, b) => a.rank - b.rank),
          }))
          .filter((g) => g.takers.length > 0),
      }))
      .sort((a, b) => a.team.localeCompare(b.team));
  }, [takers, activeTypes, teamFilter, firstChoiceOnly]);

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


  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Who takes the set pieces?</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Penalty, free-kick and corner duty for every Premier League club, ranked in order. Set-piece duty is one of the
          biggest single swings in a player&rsquo;s fantasy value, and it changes more often than most lists reflect.
        </p>
        <p className="text-ink-500 text-xs mt-2 max-w-prose">
          On corners, the source gives one ordered list per club rather than naming sides. We treat the top two takers as
          joint first choice &mdash; one each side &mdash; the next two as second choice, and so on. Which player takes
          which side is an assumption; the ranking is not.
        </p>
        {lastUpdated && (
          <p className="text-xs text-ink-500 font-mono mt-2">
            Updated <time dateTime={lastUpdated}>{new Date(lastUpdated).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
          </p>
        )}
      </header>

      {share && (() => {
        const goals = goalSplit(share);
        const assists = assistSplit(share);
        const setPieceGoalPct = goals.filter((g) => g.label !== 'Open play').reduce((s, g) => s + g.pct, 0);
        const Bar = ({ rows }: { rows: { label: string; goals: number; pct: number }[] }) => (
          <div className="space-y-1.5 mt-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs text-ink-700 truncate">{r.label}</span>
                <div className="flex-1 bg-chalk-200 rounded h-4 overflow-hidden">
                  <div
                    className={r.label === 'Open play' ? 'bg-pitch-700 h-full rounded' : 'bg-amber-500 h-full rounded'}
                    style={{ width: `${r.pct}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums">{Math.round(r.pct)}%</span>
              </div>
            ))}
          </div>
        );
        return (
          <section className="border border-chalk-300 rounded-lg bg-white p-4">
            <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">What each duty is actually worth</h2>
            <p className="text-ink-900 mt-1 max-w-prose">
              Across a full Premier League season, <strong>{Math.round(setPieceGoalPct)}% of goals</strong> came from set
              pieces &mdash; and the split matters. Corners produced{' '}
              <strong>{Math.round(goals.find((g) => g.label === 'Corners')?.pct ?? 0)}%</strong> of all goals against{' '}
              <strong>{Math.round(goals.find((g) => g.label === 'Penalties')?.pct ?? 0)}%</strong> from penalties, but
              penalties are shared among far fewer takers, so a penalty duty is worth much more per player.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 mt-3">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-ink-500">
                  Goals &mdash; {share.goals.toLocaleString()}
                </p>
                <Bar rows={goals} />
              </div>
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-ink-500">
                  Assists &mdash; {share.assists.toLocaleString()}
                </p>
                <Bar rows={assists} />
              </div>
            </div>
            <p className="text-ink-500 text-xs mt-3 max-w-prose">
              {share.penalties_taken.toLocaleString()} penalties and {share.corners_taken.toLocaleString()} corners were
              taken across the season. &ldquo;Other set plays&rdquo; covers indirect free kicks and similar dead-ball
              situations that aren&rsquo;t a direct shot.
            </p>
          </section>
        );
      })()}


      {index.length > 0 && (
        <section>
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Set-piece index</h2>
          <p className="text-ink-700 text-sm mt-1 max-w-prose">
            Whose dead-ball role is worth the most, weighting each duty by what it historically produces rather than
            counting duties alike. A penalty is worth far more per taker than a corner, and a second-choice taker is
            worth far less than a first.
          </p>
          <div className="space-y-1.5 mt-3">
            {index.slice(0, 12).map((r) => (
              <div key={`${r.team_id}-${r.player_name}`} className="flex items-center gap-3">
                <span className="w-28 sm:w-36 shrink-0 text-sm text-ink-900 truncate">{r.player_name}</span>
                <span className="w-20 shrink-0 text-xs text-ink-500 truncate hidden sm:block">{r.team_name}</span>
                <div className="flex-1 bg-chalk-200 rounded h-4 overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded"
                    style={{ width: `${(r.index_score / index[0].index_score) * 100}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums">{Math.round(r.index_score)}</span>
              </div>
            ))}
          </div>
          <p className="text-ink-500 text-xs mt-3 max-w-prose">
            A ranking, not an expected-points figure: it says one player&rsquo;s dead-ball role is worth more than
            another&rsquo;s, not how many points it will return. Weights come from a full Opta season, so they describe
            the Premier League in general rather than these specific takers.
          </p>
        </section>
      )}

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
        {SET_PIECE_TYPES.map((t) => {
          const on = activeTypes.includes(t.key);
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setActiveTypes((prev) =>
                  // Never let the last one be switched off -- an empty
                  // selection shows nothing and reads as a broken page
                  // rather than a deliberate filter.
                  on ? (prev.length > 1 ? prev.filter((k) => k !== t.key) : prev) : [...prev, t.key]
                )
              }
              className={[
                'text-sm rounded px-3 py-1.5 border transition-colors',
                on ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'border-chalk-300 text-ink-500 hover:bg-chalk-200',
              ].join(' ')}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <section>
        {byTeam.length === 0 ? (
          <p className="text-ink-500 text-sm">Nothing matches those filters.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {byTeam.map(({ team, slug, groups }) => (
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
                {/* Columns, not stacked rows: a club's duties read across
                    in one glance and each card stays compact, which is
                    what lets all 20 clubs fit a page. */}
                <dl
                  className="mt-2 grid gap-x-3 gap-y-1.5"
                  style={{ gridTemplateColumns: `repeat(${Math.min(groups.length, 2)}, minmax(0, 1fr))` }}
                >
                  {groups.map((g) => (
                    <div key={g.label} className="min-w-0">
                      <dt className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-500 truncate">
                        {g.label}
                      </dt>
                      <dd className="text-sm text-ink-900 leading-tight">
                        {g.takers.map((t) => (
                          <span key={`${t.player_name}-${t.rank}`} className="block truncate">
                            {/* Number EVERY taker, including the first.
                                Hiding "1." made the top taker look like
                                an unranked note rather than first choice,
                                which is the single most important thing
                                on this page. */}
                            <span className="text-ink-500 mr-1">{t.rank}.</span>
                            {t.player_name}
                          </span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-ink-500 text-xs max-w-prose">
        Order reflects observed duty, not a guarantee &mdash; managers rotate takers, and a first-choice penalty taker can
        hand one over on the day.
      </p>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fpl/start/discover" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          More to discover
        </Link>
        <Link to="/fpl/in-the-papers" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          In the papers
        </Link>
      </nav>
    </article>
  );
}

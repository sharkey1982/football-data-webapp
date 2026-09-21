// ============================================================================
// src/pages/fpl/InThePapersPage.tsx
//
// "In the papers" -- formerly two pages, the Newsroom and the Transfer Window.
//
// TOP: the gameweek's headlines -- prices, availability and ownership swings --
// kept for the WHOLE gameweek and filterable by gameweek. The old Newsroom
// showed only the latest day, so yesterday's news vanished every morning.
//
// BENEATH: the transfer window, the longer seven-day view of market movers,
// unchanged in substance (MarketMoversPanel).
//
// Gameweeks are always named explicitly, with their dates, because a
// gameweek is often midway through and "this week" is ambiguous. A day's news
// belongs to the gameweek being played when it broke: from the day after one
// deadline up to and including the next deadline day.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import MarketMoversPanel from '../../components/fpl/MarketMoversPanel';
import { formatShortDay as shortDay } from '../../lib/formatDate';
import {
  getDigestGameweeks,
  getGameweekDigest,
  notable,
  CHANGE_LABELS,
  CHANGE_ORDER,
  type DigestChangeType,
  type DigestGameweek,
  type GameweekDigestEntry,
} from '../../lib/digestApi';


export default function InThePapersPage() {
  const [gameweeks, setGameweeks] = useState<DigestGameweek[] | null>(null);
  const [gw, setGw] = useState<number | null>(null);
  const [entries, setEntries] = useState<GameweekDigestEntry[] | null>(null);
  const [notableOnly, setNotableOnly] = useState(true);
  const [error, setError] = useState(false);

  useDocumentHead({
    title: 'In the papers \u2014 this gameweek\u2019s FPL news',
    description:
      'Fantasy Premier League price rises and falls, availability news and ownership swings, kept for the whole gameweek, plus the seven-day transfer window.',
    path: '/fpl/in-the-papers',
  });

  useEffect(() => {
    getDigestGameweeks(13)
      .then((g) => { setGameweeks(g); setGw(g[0]?.gameweek ?? null); })
      .catch(() => { setGameweeks([]); setError(true); });
  }, []);

  useEffect(() => {
    if (gw == null) return;
    let cancelled = false;
    getGameweekDigest(13, gw)
      .then((e) => { if (!cancelled) setEntries(e); })
      .catch(() => { if (!cancelled) { setEntries([]); setError(true); } });
    return () => { cancelled = true; };
  }, [gw]);

  const view = useMemo(() => (notableOnly ? notable(entries ?? []) : entries ?? []) as GameweekDigestEntry[], [entries, notableOnly]);
  const grouped = useMemo(() => {
    const m = new Map<DigestChangeType, GameweekDigestEntry[]>();
    for (const e of view) {
      if (!m.has(e.change_type)) m.set(e.change_type, []);
      m.get(e.change_type)!.push(e);
    }
    return CHANGE_ORDER.filter((k) => m.has(k)).map((k) => ({ key: k, items: m.get(k)! }));
  }, [view]);

  const current = gameweeks?.find((g) => g.gameweek === gw) ?? null;
  const isLatest = !!gameweeks?.length && gameweeks[0].gameweek === gw;

  return (
    <article className="space-y-8">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">In the papers</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          The gameweek&rsquo;s FPL news &mdash; price moves, injuries and ownership swings &mdash; kept for the whole
          gameweek, with the longer seven-day transfer window beneath. What happened, not what might.
        </p>
      </header>

      <section aria-labelledby="headlines-h" className="space-y-4">
        <h2 id="headlines-h" className="font-display uppercase tracking-wide text-xl text-ink-900">The headlines</h2>

        {gameweeks === null && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
        {error && <p className="text-ink-700 text-sm">The news could not be loaded just now. Please try again shortly.</p>}
        {gameweeks && gameweeks.length === 0 && !error && <p className="text-ink-700">No news has been recorded yet this season.</p>}

        {gameweeks && gameweeks.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a gameweek">
              {gameweeks.map((g, i) => (
                <button
                  key={g.gameweek}
                  type="button"
                  aria-pressed={g.gameweek === gw}
                  onClick={() => { if (g.gameweek !== gw) { setEntries(null); setGw(g.gameweek); } }}
                  className={[
                    'text-sm rounded px-3 py-1.5 border transition-colors font-mono',
                    g.gameweek === gw ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'border-chalk-300 text-ink-700 hover:bg-chalk-200',
                  ].join(' ')}
                >
                  GW{g.gameweek}{i === 0 ? ' \u00b7 now' : ''}
                </button>
              ))}
            </div>

            {current && (
              <p className="text-sm text-ink-700">
                <strong>Gameweek {current.gameweek}</strong> news, {shortDay(current.first_date)} to {shortDay(current.last_date)}
                {isLatest ? ' (so far \u2014 the gameweek is still going)' : ''}.{' '}
                <span className="text-ink-500">
                  News is filed under the gameweek being played when it broke: from the day after one deadline up to the next.
                </span>
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={notableOnly} onClick={() => setNotableOnly(true)}
                className={['text-sm rounded px-3 py-1.5 border transition-colors', notableOnly ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'border-chalk-300 text-ink-700 hover:bg-chalk-200'].join(' ')}>
                Worth knowing
              </button>
              <button type="button" aria-pressed={!notableOnly} onClick={() => setNotableOnly(false)}
                className={['text-sm rounded px-3 py-1.5 border transition-colors', !notableOnly ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'border-chalk-300 text-ink-700 hover:bg-chalk-200'].join(' ')}>
                Everything{entries ? ` (${entries.length})` : ''}
              </button>
            </div>

            {entries === null && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
            {entries && grouped.length === 0 && (
              <p className="text-ink-500 text-sm">
                {entries.length === 0 ? `Nothing moved in Gameweek ${gw}.` : 'Nothing notable moved. Switch to \u201cEverything\u201d for the full list.'}
              </p>
            )}

            {grouped.map(({ key, items }) => (
              <section key={key} aria-label={CHANGE_LABELS[key]}>
                <h3 className="font-display uppercase tracking-wide text-lg text-ink-900">
                  {CHANGE_LABELS[key]} <span className="text-ink-500 font-mono text-sm">({items.length})</span>
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {items.map((e) => (
                    <li key={`${e.change_type}-${e.fpl_player_id}-${e.event_date}`} className="text-sm flex flex-wrap items-baseline gap-x-2">
                      <time dateTime={e.event_date} className="font-mono text-xs text-ink-500 w-20 shrink-0">{shortDay(e.event_date)}</time>
                      <span className="font-medium text-ink-900">
                        {e.slug ? <Link to={`/fpl/players/${e.slug}`} className="text-pitch-800 underline underline-offset-2">{e.web_name}</Link> : e.web_name}
                      </span>
                      <span className="text-ink-500">{e.team_name} &middot; {e.position_label} &middot; {e.ownership.toFixed(1)}% owned</span>
                      <span className="font-mono text-xs text-ink-900">{e.old_value} &rarr; {e.new_value}</span>
                      {e.detail && <span className="text-ink-700 text-xs w-full sm:w-auto">{e.detail}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <p className="text-ink-500 text-xs max-w-prose">
              &ldquo;Worth knowing&rdquo; keeps changes affecting players owned by at least 5% of squads, plus every
              availability change regardless of ownership &mdash; a newly injured player nobody owns yet is exactly
              what&rsquo;s worth hearing early.
            </p>
          </>
        )}
      </section>

      <MarketMoversPanel />

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fpl/price-risk" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">What might move next (Bullpit)</Link>
        <Link to="/fpl/injuries" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">Physio room</Link>
        <Link to="/fpl/player-points" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">Player projections</Link>
      </nav>
    </article>
  );
}

// ============================================================================
// src/pages/nfl/NflTvGuidePage.tsx
//
// /nfl/tv-guide -- "TV Guide", as in Football: every NFL game in the next
// two weeks, in UK time, with how to watch it live in the UK. Built from the
// published UK rights (src/lib/nflWatch.ts), with the Sunday games Sky and 5
// pick week by week stated as such and linked to the broadcaster's listings.
// Client-rendered: it depends on today's date.
// ============================================================================

import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import WatchOptions from '../../components/WatchOptions';
import { NFL_HUB_PATH, NFL_TV_PATH, loadNflUpcoming, nflTeamPath, ukDay, ukKickoff, weekLabel, type NflGame } from '../../lib/nflApi';
import { NFL_TV_SOURCES, RULES_CHECKED, nflWatch } from '../../lib/nflWatch';

function GameWatch({ g }: { g: NflGame }) {
  const w = nflWatch(g);
  return (
    <li className="border border-chalk-300 rounded-lg bg-white/60 px-3 py-2.5 grid sm:grid-cols-[1fr_1.2fr] gap-x-4 gap-y-2" data-testid="nfl-tv-game">
      <div>
        <p className="font-mono text-xs text-ink-500">{`${ukKickoff(g)} · ${weekLabel(g.game_type, g.week)}`}</p>
        <p className="text-sm text-ink-900 mt-0.5">
          <Link to={nflTeamPath(g.away_slug)} className="hover:underline">{g.away_name}</Link>
          <span className="text-ink-500 text-xs">{g.neutral_site ? ' v ' : ' @ '}</span>
          <Link to={nflTeamPath(g.home_slug)} className="hover:underline">{g.home_name}</Link>
        </p>
        {g.stadium && <p className="text-xs text-ink-500">{g.stadium}</p>}
      </div>
      <div>
        <WatchOptions offers={w.offers} partners={[]} fixtureId={0} page="tv_guide" />
        {w.pickedWeekly && (
          <p className="text-[11px] text-ink-500 mt-1">
            {w.pickedWeekly}{' '}
            <a href={w.listingsUrl} className="underline" rel="nofollow noopener noreferrer" target="_blank">Sky&rsquo;s NFL listings</a>
          </p>
        )}
      </div>
    </li>
  );
}

export default function NflTvGuidePage() {
  const { data, failed, loading } = useKeyedFetch('upcoming', loadNflUpcoming);
  useDocumentHead({
    title: 'NFL TV guide: how to watch every game in the UK',
    description: 'Every NFL game in the next two weeks in UK time, with where to watch it live in the UK: Sky Sports, 5 (free) and DAZN NFL Game Pass.',
    path: NFL_TV_PATH,
  });

  const days: { day: string; games: NflGame[] }[] = [];
  for (const g of data?.games ?? []) {
    const day = ukDay(g);
    const last = days[days.length - 1];
    if (last && last.day === day) last.games.push(g);
    else days.push({ day, games: [g] });
  }

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to="/nfl/discover" className="hover:underline">Discover</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">TV Guide</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          How, when and where to watch NFL games live in the UK. Times are UK time. Every game streams live on DAZN NFL Game Pass. Sky Sports shows the prime-time games, every London and European game, the play-offs and the Super Bowl. 5 shows two Sunday games free each week, the London games and the Super Bowl.
        </p>
      </header>

      {failed && <p className="text-ink-700">The TV guide is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && data.games.length === 0 && <p className="text-ink-700">No NFL games in the next two weeks.</p>}

      {days.map(({ day, games }) => (
        <section key={day} aria-label={day}>
          <h2 className="font-mono text-xs uppercase tracking-widest text-ink-500 mb-2">{day}</h2>
          <ul className="space-y-2">
            {games.map((g) => <GameWatch key={g.game_id} g={g} />)}
          </ul>
        </section>
      ))}

      <section aria-labelledby="tv-how" className="text-xs text-ink-500 max-w-prose space-y-1.5 border-t border-chalk-300 pt-4">
        <h2 id="tv-how" className="font-display uppercase tracking-wide text-sm text-ink-900">How this guide works</h2>
        <p>
          There is no official per-game feed of UK NFL listings, so this guide applies the published UK rights for the 2026/27 season to every game. Where Sky Sports and 5 choose games week by week (mostly the Sunday 18:00 and 21:25 windows) it says so and links to Sky&rsquo;s listings rather than guessing. Sky Sports channels are also available through NOW; 5 and 5ACTION also stream on My5.
        </p>
        <p>{`Rights last checked ${RULES_CHECKED}. Sources:`}</p>
        <ul className="list-disc pl-5">
          {NFL_TV_SOURCES.map((s) => (
            <li key={s.url}>
              <a href={s.url} className="underline" rel="nofollow noopener noreferrer" target="_blank">{s.label}</a>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

// ============================================================================
// src/pages/football/ScorelinesPage.tsx
//
// Scoreline Explorer: /football/history/scorelines. A 6x6 grid of how often
// each scoreline happened in a league, for a span of seasons, or from one
// club's side (home, away or both). Filters live in the URL; the page is
// one canonical URL (filtered views are not separate pages). Server-rendered
// at build for the Premier League, all seasons.
// ============================================================================

import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { LEAGUE_SLUGS, leagueBySlug, seasonDisplay } from '../../lib/leagueSeasonApi';
import { getLeagueClubs, getScorelines, scoreLabel, scorelineSentence, sharePct, summariseScorelines, type ScorelinesData } from '../../lib/scorelinesApi';
import NotFoundPage from '../NotFoundPage';

const LEAGUE_OPTIONS: [string, string][] = [
  ['premier-league', 'Premier League'], ['championship', 'Championship'], ['league-one', 'League One'], ['league-two', 'League Two'],
  ['national-league', 'National League'], ['la-liga', 'La Liga'], ['bundesliga', 'Bundesliga'], ['serie-a', 'Serie A'], ['ligue-1', 'Ligue 1'],
  ['primeira-liga', 'Primeira Liga'], ['eredivisie', 'Eredivisie'], ['scottish-premiership', 'Scottish Premiership'], ['belgian-pro-league', 'Belgian Pro League'],
  ['super-lig', 'Süper Lig'], ['super-league-greece', 'Super League Greece'], ['austrian-bundesliga', 'Austrian Bundesliga'], ['danish-superliga', 'Danish Superliga'],
  ['eliteserien', 'Eliteserien'], ['ekstraklasa', 'Ekstraklasa'], ['romanian-superliga', 'Romanian Superliga'], ['allsvenskan', 'Allsvenskan'],
  ['swiss-super-league', 'Swiss Super League'], ['veikkausliiga', 'Veikkausliiga'],
];
const YEARS = Array.from({ length: 2026 - 1992 + 1 }, (_, i) => 1992 + i);
const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);

export default function ScorelinesPage({ initialData }: { initialData?: ScorelinesData }) {
  const [params, setParams] = useSearchParams();
  const slug = params.get('league') ?? 'premier-league';
  const from = num(params.get('from'));
  const to = num(params.get('to'));
  const teamId = num(params.get('team'));
  const venue = params.get('venue') === 'H' || params.get('venue') === 'A' ? (params.get('venue') as 'H' | 'A') : null;
  const key = JSON.stringify({ slug, from, to, teamId, venue: teamId ? venue : null });
  const defaultKey = JSON.stringify({ slug: 'premier-league', from: null, to: null, teamId: null, venue: null });

  const { data, failed, loading } = useKeyedFetch(
    key,
    async () => {
      const league = await leagueBySlug(slug);
      if (!league) return null;
      return { league, rows: await getScorelines({ leagueId: league.league_id, from, to, teamId, venue: teamId ? venue : null }) };
    },
    initialData ? { key: defaultKey, data: initialData } : undefined
  );
  const clubs = useKeyedFetch(data ? `clubs:${data.league.league_id}` : null, () => getLeagueClubs(data!.league.league_id));

  const teamName = teamId ? clubs.data?.find((c) => c.team_id === teamId)?.name ?? null : null;
  const summary = data ? summariseScorelines(data.rows) : null;
  const span = data && (from || to) ? ` ${from ? seasonDisplay(data.league.code, from) : 'first season'} to ${to ? seasonDisplay(data.league.code, to) : 'now'}` : '';
  const subject = data ? `${data.league.name}${span}${teamName ? ` ${teamName}${venue === 'H' ? ' home' : venue === 'A' ? ' away' : ''}` : ''}` : '';
  const sentence = summary && data ? scorelineSentence(summary, subject, teamName) : '';

  useDocumentHead({
    title: 'Score Explore: how often every score happens',
    description: sentence || 'How often each scoreline happens in every league on file, for any span of seasons or from one club’s side.',
    path: '/football/history/scorelines',
  });

  if (!loading && !failed && data === null) return <NotFoundPage />;

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  const max = summary ? Math.max(1, ...summary.grid.flat()) : 1;
  const aLabel = teamName ? `${teamName} goals` : 'Home goals';
  const bLabel = teamName ? 'Opponent goals' : 'Away goals';

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/football" className="hover:underline">Football &middot; Score Explore</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Score Explore</h1>
      </header>

      <form className="grid gap-3 sm:grid-cols-5 items-end" onSubmit={(e) => e.preventDefault()}>
        <label className="block sm:col-span-2">
          <span className="text-xs font-mono uppercase tracking-widest text-ink-500">League</span>
          <select value={slug} onChange={(e) => update({ league: e.target.value === 'premier-league' ? null : e.target.value, team: null, venue: null })} className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white">
            {LEAGUE_OPTIONS.filter(([s]) => Object.values(LEAGUE_SLUGS).includes(s)).map(([s, n]) => <option key={s} value={s}>{n}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-widest text-ink-500">From</span>
          <select value={from ?? ''} onChange={(e) => update({ from: e.target.value || null })} className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white">
            <option value="">First season</option>
            {YEARS.map((y) => <option key={y} value={y}>{data ? seasonDisplay(data.league.code, y) : y}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-widest text-ink-500">To</span>
          <select value={to ?? ''} onChange={(e) => update({ to: e.target.value || null })} className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white">
            <option value="">Now</option>
            {YEARS.map((y) => <option key={y} value={y}>{data ? seasonDisplay(data.league.code, y) : y}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Club</span>
          <select value={teamId ?? ''} onChange={(e) => update({ team: e.target.value || null, venue: null })} className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white">
            <option value="">All matches</option>
            {(clubs.data ?? []).map((c) => <option key={c.team_id} value={c.team_id}>{c.name}</option>)}
          </select>
        </label>
        {teamId && (
          <label className="block">
            <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Venue</span>
            <select value={venue ?? ''} onChange={(e) => update({ venue: e.target.value || null })} className="mt-1 w-full border border-chalk-300 rounded px-3 py-2 text-sm bg-white">
              <option value="">Home and away</option>
              <option value="H">Home</option>
              <option value="A">Away</option>
            </select>
          </label>
        )}
      </form>

      {failed && <p className="text-ink-700">Scorelines are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && summary && (
        summary.total === 0 ? (
          <p className="text-ink-700">No matches for this selection.</p>
        ) : (
          <>
            <p className="text-ink-900 max-w-prose" data-testid="scorelines-sentence">{sentence}</p>
            <div className="overflow-x-auto">
              <table className="text-sm border-collapse" aria-label={`Share of matches by scoreline: rows ${aLabel.toLowerCase()}, columns ${bLabel.toLowerCase()}`}>
                <thead>
                  <tr>
                    <th scope="col" className="text-[10px] font-mono text-ink-500 px-1 pb-1 text-left">{`${aLabel} ↓ · ${bLabel} →`}</th>
                    {[0, 1, 2, 3, 4, 5].map((b) => <th key={b} scope="col" className="text-xs font-mono text-ink-500 px-2 pb-1 w-16">{b === 5 ? '5+' : b}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {summary.grid.map((row, a) => (
                    <tr key={a}>
                      <th scope="row" className="text-xs font-mono text-ink-500 pr-2 text-right">{a === 5 ? '5+' : a}</th>
                      {row.map((n, b) => (
                        <td
                          key={b}
                          title={`${scoreLabel(a, b)}: ${n.toLocaleString('en-GB')} matches`}
                          className="border border-chalk-300 text-center px-2 py-2 font-mono text-xs tabular-nums w-16"
                          style={{ backgroundColor: `color-mix(in srgb, var(--color-pitch-700) ${Math.round((n / max) * 70)}%, white)`, color: n / max > 0.55 ? 'white' : undefined }}
                        >
                          <span className="block">{sharePct(n, summary.total)}</span>
                          <span className="block text-[10px] opacity-80">{n.toLocaleString('en-GB')}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-500 max-w-prose">
              {`${summary.total.toLocaleString('en-GB')} league matches. Rows are ${aLabel.toLowerCase()}, columns ${bLabel.toLowerCase()}; 5+ means five or more. Win, draw and loss shares use the full score.`}
            </p>
          </>
        )
      )}
    </article>
  );
}

// ============================================================================
// src/pages/football/RecordsPage.tsx
//
// /football/records/:league -- the Record Book for one league: team-season
// records (per game, complete seasons), match records and streaks, top 10
// each with ties shown. /football/records (no league) lists the leagues.
// Server-rendered at build with initialData.
// ============================================================================

import { Link, useParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { loadRecords, recordsPath, type RecordList, type RecordsData } from '../../lib/recordsApi';
import { leaguePath, loadLeaguesList, type LeaguesListEntry } from '../../lib/leagueSeasonApi';
import NotFoundPage from '../NotFoundPage';

function List({ list }: { list: RecordList }) {
  if (list.rows.length === 0) return null;
  return (
    <section aria-labelledby={`rec-${list.id}`} className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
      <h2 id={`rec-${list.id}`} className="font-display uppercase tracking-wide text-base text-ink-900 px-3 pt-3">{list.title}</h2>
      {list.note && <p className="text-xs text-ink-500 px-3">{list.note}</p>}
      <ol className="mt-2 divide-y divide-chalk-200">
        {list.rows.map((r, i) => (
          <li key={i} className="px-3 py-1.5 text-sm flex gap-3">
            <span className="font-mono text-xs text-ink-500 tabular-nums w-7 shrink-0 pt-0.5">{r.tied ? `=${r.rank}` : r.rank}</span>
            <span className="min-w-0">
              <span className="text-ink-900">
                {r.team && (r.teamPath ? <Link to={r.teamPath} className="hover:underline">{r.team}</Link> : r.team)}
                {r.team ? ` · ${r.value}` : r.value}
              </span>
              <span className="block text-xs text-ink-500">
                {r.seasonPath ? <Link to={r.seasonPath} className="underline underline-offset-2">{r.season}</Link> : r.season}
                {` · ${r.detail}`}
                {r.flag ? ` · ${r.flag}` : ''}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RecordsIndex({ initialData }: { initialData?: LeaguesListEntry[] }) {
  const { data, failed, loading } = useKeyedFetch('all', loadLeaguesList, initialData ? { key: 'all', data: initialData } : undefined);
  useDocumentHead({
    title: 'Football records: most points, longest runs, biggest wins',
    description: 'Record books for the English leagues since 1992/93 and 18 European top flights: points, goals, title margins, biggest wins and the longest winning, unbeaten and losing runs.',
    path: '/football/records',
  });
  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Football</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Record Book</h1>
      </header>
      {failed && <p className="text-ink-700">Records are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((l) => (
          <li key={l.league_id} className="text-sm">
            <Link to={recordsPath(l)} className="text-pitch-800 underline underline-offset-2">{`${l.name} records`}</Link>
            {l.country && <span className="text-ink-500">{` · ${l.country}`}</span>}
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function RecordsPage({ initialData, initialList }: { initialData?: RecordsData; initialList?: LeaguesListEntry[] }) {
  const { league: slug } = useParams();
  if (!slug) return <RecordsIndex initialData={initialList} />;
  return <LeagueRecords slug={slug} initialData={initialData} />;
}

function LeagueRecords({ slug, initialData }: { slug: string; initialData?: RecordsData }) {
  const { data, failed, loading } = useKeyedFetch(slug, () => loadRecords(slug), initialData ? { key: initialData.league.slug, data: initialData } : undefined);
  useDocumentHead({
    title: data ? `${data.league.name} records: most points, longest runs, biggest wins` : 'League records',
    description: data?.headline || 'Points, goals, title margins, biggest wins and the longest runs in one league.',
    path: `/football/records/${slug}`,
  });
  if (!loading && !failed && data === null) return <NotFoundPage />;
  const group = (prefix: string, pred: (l: RecordList) => boolean) => (
    <div className="grid gap-4 md:grid-cols-2" aria-label={prefix}>
      {data!.lists.filter(pred).map((l) => <List key={l.id} list={l} />)}
    </div>
  );
  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/football/records" className="hover:underline">Football &middot; Records</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">{data ? `${data.league.name} records` : 'Records'}</h1>
      </header>
      {failed && <p className="text-ink-700">Records are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="records-headline">{data.headline}</p>
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Seasons</h2>
          {group('Season records', (l) => !l.id.startsWith('streak_') && l.id !== 'biggest_win' && l.id !== 'highest_scoring')}
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Matches</h2>
          {group('Match records', (l) => l.id === 'biggest_win' || l.id === 'highest_scoring')}
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Runs</h2>
          {group('Runs', (l) => l.id.startsWith('streak_'))}
          <details className="text-sm text-ink-700 max-w-prose">
            <summary className="cursor-pointer text-ink-900">How these are counted</summary>
            <p className="mt-2">
              League matches only. Season records use complete seasons (not curtailed, not split into groups) and rank by the per-game rate,
              because season lengths differ; points are after deductions. Runs continue across consecutive seasons in the same league and end if
              the club spends a season in another division. Ties share a rank (shown as =). A run marked &ldquo;from the start of our data&rdquo;
              began in the first season on file, so it may have started earlier.
            </p>
          </details>
          <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            <Link to={leaguePath(data.league)} className="text-pitch-800 underline underline-offset-2">{`Every ${data.league.name} season`}</Link>
            <Link to="/football/records" className="text-pitch-800 underline underline-offset-2">Other leagues’ records</Link>
          </nav>
        </>
      )}
    </article>
  );
}

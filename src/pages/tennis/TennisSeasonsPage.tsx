// ============================================================================
// src/pages/tennis/TennisSeasonsPage.tsx
//
// /tennis/seasons -- "Past seasons", as in Football and NFL: every season on
// a tour with its Grand Slam champions and the player with the most titles,
// each linking to that season's page. ?tour=wta for the WTA. Static (ATP).
// Phase 3: the title and Grand Slam races with From/To seasons (TitleRaces).
// ============================================================================

import { Link, useSearchParams } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import { PlayerLink, TennisHeader } from '../../components/tennis/TennisBits';
import TourToggle from '../../components/tennis/TourToggle';
import TitleRaces from '../../components/tennis/TitleRaces';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { TENNIS_SEASONS_PATH, loadTennisSeasonIndex, tennisSeasonPath, tennisSeasonsPath, type TennisSeasonIndexData } from '../../lib/tennisApi';
import { DATA_NOTE, FIRST_YEAR, parseTour, seasonsSentence, type SeasonIndexRow } from '../../lib/tennisStats';

const SLAM_SHORT: Record<string, string> = { 'Australian Open': 'AO', 'French Open': 'RG', Wimbledon: 'W', 'US Open': 'USO' };

export default function TennisSeasonsPage({ initialData }: { initialData?: TennisSeasonIndexData }) {
  const [params] = useSearchParams();
  const tour = parseTour(params.get('tour')) ?? initialData?.tour ?? 'ATP';
  const { data, failed, loading } = useKeyedFetch(tour, () => loadTennisSeasonIndex(tour), initialData ? { key: initialData.tour, data: initialData } : undefined);
  useDocumentHead({
    title: `Every ${tour} season since ${FIRST_YEAR[tour]}: Grand Slam champions and title leaders`,
    description: data ? seasonsSentence(tour, data.rows) : `Every ${tour} season since ${FIRST_YEAR[tour]}: Grand Slam champions, title leaders, upsets and streaks.`,
    path: TENNIS_SEASONS_PATH,
  });

  const columns: Column<SeasonIndexRow>[] = [
    { key: 'year', label: 'Season', render: (r) => <Link to={tennisSeasonPath(tour, r.year)} className="text-pitch-800 underline underline-offset-2">{r.year}</Link>, sortValue: (r) => r.year, descFirst: true },
    {
      key: 'slams',
      label: 'Grand Slam champions',
      render: (r) =>
        r.slams.length ? (
          <span className="space-x-1">
            {r.slams.map((f, i) => (
              <span key={f.tournament}>
                <PlayerLink tour={tour} slug={f.winnerSlug} name={f.winner} />
                <abbr title={f.tournament} className="text-xs text-ink-500 no-underline">{` ${SLAM_SHORT[f.tournament] ?? f.tournament}`}</abbr>
                {i < r.slams.length - 1 ? ', ' : ''}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-ink-500">–</span>
        ),
    },
    {
      key: 'top',
      label: 'Most titles',
      render: (r) => (r.topSlug ? <><PlayerLink tour={tour} slug={r.topSlug} name={r.topName!} /><span className="font-mono text-xs text-ink-500">{` ${r.topTitles}`}</span></> : '–'),
      sortValue: (r) => r.topTitles,
      descFirst: true,
      className: 'hidden sm:table-cell',
    },
    { key: 'finals', label: 'Titles decided', render: (r) => (r.complete ? r.finals : `${r.finals} so far`), sortValue: (r) => r.finals, align: 'right', descFirst: true, className: 'hidden md:table-cell' },
  ];

  return (
    <article className="space-y-5">
      <TennisHeader title="Past seasons" toggle={<TourToggle tour={tour} to={(t) => tennisSeasonsPath(t)} />} />
      {failed && <p className="text-ink-700">Past seasons are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="tennis-seasons-story">{seasonsSentence(tour, data.rows)}</p>
          {data.finals && data.finals.length > 0 && <TitleRaces tour={tour} finals={data.finals} />}
          <SortableTable columns={columns} rows={data.rows} rowKey={(r) => String(r.year)} initialSort={{ key: 'year', dir: 'desc' }} caption={`${tour} seasons`} testId="tennis-seasons-table" />
          <p className="text-xs text-ink-500">{DATA_NOTE}</p>
        </>
      )}
    </article>
  );
}

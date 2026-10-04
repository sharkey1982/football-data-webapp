// ============================================================================
// src/pages/tennis/TennisSeasonPage.tsx
//
// /tennis/seasons/:tour/:year -- one season: Grand Slam, Tour Finals and 1000
// champions, title leaders, longest winning runs, biggest upsets (by odds and
// by ranking) and every final. Static for every tour-year.
// ============================================================================

import { Link, useParams } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import { LevelBadge, PlayerLink, Section, TennisHeader } from '../../components/tennis/TennisBits';
import TourToggle from '../../components/tennis/TourToggle';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { loadTennisSeason, tennisSeasonPath, tennisSeasonsPath, type TennisSeasonData } from '../../lib/tennisApi';
import { DATA_NOTE, FIRST_YEAR, parseTour, scoreLabel, seasonSentence, shortDate, type FinalRow, type Leader, type Streak, type Tour, type Upset } from '../../lib/tennisStats';

function finalColumns(tour: Tour): Column<FinalRow>[] {
  return [
    { key: 'date', label: 'Final', render: (f) => shortDate(f.date), sortValue: (f) => f.date },
    { key: 'tournament', label: 'Tournament', render: (f) => <span>{f.tournament} <LevelBadge level={f.level} /></span>, sortValue: (f) => `${f.levelRank}|${f.tournament}` },
    { key: 'winner', label: 'Champion', render: (f) => <PlayerLink tour={tour} slug={f.winnerSlug} name={f.winner} />, sortValue: (f) => f.winner },
    { key: 'runnerUp', label: 'Runner-up', render: (f) => <PlayerLink tour={tour} slug={f.runnerUpSlug} name={f.runnerUp} />, sortValue: (f) => f.runnerUp, className: 'hidden sm:table-cell' },
    { key: 'score', label: 'Score', render: (f) => f.score, className: 'hidden md:table-cell' },
    { key: 'surface', label: 'Surface', render: (f) => f.surface ?? '–', sortValue: (f) => f.surface, className: 'hidden md:table-cell' },
  ];
}

function upsetColumns(tour: Tour, by: 'odds' | 'rank'): Column<Upset>[] {
  return [
    { key: 'date', label: 'Date', render: (u) => shortDate(u.match.match_date), sortValue: (u) => u.match.match_date },
    { key: 'winner', label: 'Winner', render: (u) => <PlayerLink tour={tour} slug={u.match.winner_slug} name={u.match.winner} rank={u.match.w_rank} />, sortValue: (u) => u.match.winner },
    { key: 'loser', label: 'Beat', render: (u) => <PlayerLink tour={tour} slug={u.match.loser_slug} name={u.match.loser} rank={u.match.l_rank} />, sortValue: (u) => u.match.loser },
    by === 'odds'
      ? { key: 'odds', label: 'Odds', render: (u) => u.odds?.toFixed(2) ?? '–', sortValue: (u) => u.odds, align: 'right', descFirst: true }
      : { key: 'gap', label: 'Rank gap', render: (u) => u.rankGap ?? '–', sortValue: (u) => u.rankGap, align: 'right', descFirst: true },
    { key: 'where', label: 'Where', render: (u) => `${u.match.tournament}, ${u.match.round}`, className: 'hidden sm:table-cell' },
    { key: 'score', label: 'Score', render: (u) => scoreLabel(u.match), className: 'hidden lg:table-cell' },
  ];
}

export default function TennisSeasonPage({ initialData }: { initialData?: TennisSeasonData }) {
  const params = useParams<{ tour: string; year: string }>();
  const tour = parseTour(params.tour) ?? initialData?.summary.tour ?? 'ATP';
  const year = Number(params.year ?? initialData?.summary.year);
  const key = `${tour}/${year}`;
  const { data, failed, loading } = useKeyedFetch(
    Number.isFinite(year) ? key : null,
    () => loadTennisSeason(tour, year),
    initialData ? { key: `${initialData.summary.tour}/${initialData.summary.year}`, data: initialData } : undefined
  );
  const s = data?.summary;
  useDocumentHead({
    title: `The ${year} ${tour} season: champions, upsets and streaks`,
    description: s ? seasonSentence(s) : `The ${year} ${tour} season: Grand Slam champions, title leaders, upsets and streaks.`,
    path: tennisSeasonPath(tour, year),
  });
  const years = data?.years ?? [];
  const prev = years.includes(year - 1) ? year - 1 : null;
  const next = years.includes(year + 1) ? year + 1 : null;

  const leaderColumns: Column<Leader>[] = [
    { key: 'name', label: 'Player', render: (l) => <PlayerLink tour={tour} slug={l.slug} name={l.name} />, sortValue: (l) => l.name },
    { key: 'titles', label: 'Titles', render: (l) => l.titles, sortValue: (l) => l.titles, align: 'right', descFirst: true },
    { key: 'finals', label: 'Finals', render: (l) => l.finals, sortValue: (l) => l.finals, align: 'right', descFirst: true },
  ];
  const streakColumns: Column<Streak>[] = [
    { key: 'name', label: 'Player', render: (r) => <PlayerLink tour={tour} slug={r.slug} name={r.name} />, sortValue: (r) => r.name },
    { key: 'length', label: 'Wins in a row', render: (r) => r.length, sortValue: (r) => r.length, align: 'right', descFirst: true },
    { key: 'when', label: 'When', render: (r) => `${shortDate(r.from)} – ${shortDate(r.to)}`, sortValue: (r) => r.from, className: 'hidden sm:table-cell' },
  ];

  return (
    <article className="space-y-6">
      <TennisHeader
        title={`${year} season`}
        crumb={{ to: tennisSeasonsPath(tour), label: 'Past seasons' }}
        toggle={<TourToggle tour={tour} to={(t) => (year >= FIRST_YEAR[t] ? tennisSeasonPath(t, year) : null)} />}
      >
        <nav aria-label="Other seasons" className="flex gap-4 text-sm">
          {prev && <Link to={tennisSeasonPath(tour, prev)} className="text-pitch-800 underline underline-offset-2">{`← ${prev}`}</Link>}
          {next && <Link to={tennisSeasonPath(tour, next)} className="text-pitch-800 underline underline-offset-2">{`${next} →`}</Link>}
        </nav>
      </TennisHeader>
      {failed && <p className="text-ink-700">This season is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {!loading && !failed && !data && <p className="text-ink-700">No {tour} season {year}. <Link to={tennisSeasonsPath(tour)} className="underline">See every season</Link>.</p>}
      {s && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="tennis-season-story">{seasonSentence(s)}</p>
          {s.surfaces.length > 0 && (
            <p className="text-sm text-ink-700">{s.surfaces.map((x) => `${x.surface} ${x.matches.toLocaleString('en-GB')}`).join(' · ')} matches</p>
          )}

          <Section title="Grand Slams, Tour Finals and 1000s" id="ts-big">
            <SortableTable columns={finalColumns(tour)} rows={s.bigFinals} rowKey={(f) => f.tournament + f.date} initialSort={{ key: 'date', dir: 'asc' }} testId="tennis-season-big-finals" empty="None played yet." />
          </Section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Section title="Most titles" id="ts-leaders">
              <SortableTable columns={leaderColumns} rows={s.leaders} rowKey={(l) => l.slug} testId="tennis-season-leaders" />
            </Section>
            <Section title="Longest winning runs" id="ts-streaks">
              <SortableTable columns={streakColumns} rows={s.streaks} rowKey={(r) => r.slug} testId="tennis-season-streaks" />
            </Section>
          </div>

          <Section title="Biggest upsets by the odds" id="ts-upsets-odds">
            <SortableTable columns={upsetColumns(tour, 'odds')} rows={s.upsetsByOdds} rowKey={(u) => u.match.source_key} testId="tennis-season-upsets-odds" empty="No odds recorded this season." />
          </Section>
          <Section title="Biggest upsets by ranking" id="ts-upsets-rank">
            <SortableTable columns={upsetColumns(tour, 'rank')} rows={s.upsetsByRank} rowKey={(u) => u.match.source_key} testId="tennis-season-upsets-rank" />
          </Section>

          <Section title={`Every final (${s.allFinals.length})`} id="ts-finals">
            <SortableTable columns={finalColumns(tour)} rows={s.allFinals} rowKey={(f) => f.tournament + f.date} initialSort={{ key: 'date', dir: 'asc' }} testId="tennis-season-finals" />
          </Section>
          <p className="text-xs text-ink-500">{`Rankings (in brackets) are as at the match. Odds are the winner's pre-match average market price (Bet365 or Pinnacle before 2010). Winning runs ignore walkovers. ${DATA_NOTE}`}</p>
        </>
      )}
    </article>
  );
}

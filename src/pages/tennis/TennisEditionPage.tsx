// ============================================================================
// src/pages/tennis/TennisEditionPage.tsx
//
// /tennis/tournaments/:tour/:slug/:year -- one year of a tournament: the
// final, both finalists' paths, the draw rebuilt from results (C1), round-
// robin results for the Tour Finals, and every match round by round. Static
// for Grand Slam, Tour Finals and 1000 editions; others client-side.
// ============================================================================

import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import { DrawView, PathsView } from '../../components/tennis/Draw';
import { LevelBadge, PlayerLink, Section, TennisHeader } from '../../components/tennis/TennisBits';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { loadTennisEdition, tennisEditionPath, tennisEventPath, type TennisEditionData } from '../../lib/tennisApi';
import { buildDraw, drawDepth, editionSentence, finalPaths } from '../../lib/tennisEvents';
import { DATA_NOTE, isUpset, parseTour, scoreLabel, shortDate, type TennisMatch, type Tour } from '../../lib/tennisStats';

function matchColumns(tour: Tour): Column<TennisMatch>[] {
  return [
    { key: 'date', label: 'Date', render: (m) => shortDate(m.match_date), sortValue: (m) => m.match_date },
    { key: 'winner', label: 'Winner', render: (m) => <PlayerLink tour={tour} slug={m.winner_slug} name={m.winner} rank={m.w_rank} />, sortValue: (m) => m.winner },
    { key: 'loser', label: 'Beat', render: (m) => <PlayerLink tour={tour} slug={m.loser_slug} name={m.loser} rank={m.l_rank} />, sortValue: (m) => m.loser },
    { key: 'score', label: 'Score', render: (m) => <span>{scoreLabel(m)}{isUpset(m) && <span className="ml-1 text-loss-700 font-semibold text-xs">Upset</span>}</span> },
  ];
}

export default function TennisEditionPage({ initialData }: { initialData?: TennisEditionData }) {
  const params = useParams<{ tour: string; slug: string; year: string }>();
  const tour = parseTour(params.tour) ?? initialData?.event.tour ?? 'ATP';
  const slug = params.slug ?? initialData?.event.slug ?? '';
  const year = Number(params.year ?? initialData?.edition.year);
  const { data, failed, loading } = useKeyedFetch(
    slug && Number.isFinite(year) ? `${tour}/${slug}/${year}` : null,
    () => loadTennisEdition(tour, slug, year),
    initialData ? { key: `${initialData.event.tour}/${initialData.event.slug}/${initialData.edition.year}`, data: initialData } : undefined
  );
  const e = data?.edition;
  useDocumentHead({
    title: e ? `${e.name} ${year}: draw, results and the road to the final` : `${tour} tournament ${year}`,
    description: data ? editionSentence(data) : `A ${tour} tournament's draw and results.`,
    path: tennisEditionPath(tour, slug, year),
  });
  const draw = useMemo(() => (data ? buildDraw(data.matches, drawDepth(data.edition.level_rank)) : null), [data]);
  const paths = useMemo(() => (data ? finalPaths(data.matches) : []), [data]);
  const years = data?.years ?? [];
  const i = years.indexOf(year);
  const prev = i > 0 ? years[i - 1] : null;
  const next = i >= 0 && i < years.length - 1 ? years[i + 1] : null;

  return (
    <article className="space-y-6">
      <TennisHeader title={e ? `${e.name} ${year}` : `${year}`} crumb={data ? { to: tennisEventPath(tour, slug), label: data.event.name } : undefined}>
        {e && (
          <p className="text-sm text-ink-700 flex flex-wrap gap-x-3 items-center">
            <LevelBadge level={e.level} />
            <span>{e.city}</span>
            <span>{e.surface}</span>
            <span>{`${shortDate(e.start_date)} – ${shortDate(e.end_date)}`}</span>
          </p>
        )}
        <nav aria-label="Other years" className="flex gap-4 text-sm">
          {prev && <Link to={tennisEditionPath(tour, slug, prev)} className="text-pitch-800 underline underline-offset-2">{`← ${prev}`}</Link>}
          {next && <Link to={tennisEditionPath(tour, slug, next)} className="text-pitch-800 underline underline-offset-2">{`${next} →`}</Link>}
        </nav>
      </TennisHeader>
      {failed && <p className="text-ink-700">This tournament is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {!loading && !failed && !data && <p className="text-ink-700">No edition that year. <Link to={tennisEventPath(tour, slug)} className="underline">See every year</Link>.</p>}
      {data && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="tennis-edition-story">{editionSentence(data)}</p>
          {paths.length > 0 && (
            <Section title="The road to the final" id="ted-paths">
              <PathsView paths={paths} tour={tour} />
            </Section>
          )}
          {draw && (
            <Section title={draw.rounds.length >= 4 ? 'The draw from the last 16' : 'The draw from the quarter-finals'} id="ted-draw">
              <DrawView draw={draw} tour={tour} />
            </Section>
          )}
          {draw && draw.roundRobin.length > 0 && (
            <Section title="Round robin" id="ted-rr">
              <SortableTable columns={matchColumns(tour)} rows={draw.roundRobin} rowKey={(m) => m.source_key} />
            </Section>
          )}
          {draw?.earlier.map((r) => (
            <Section key={r.round} title={r.round} id={`ted-${r.round.replace(/\W+/g, '-').toLowerCase()}`}>
              <SortableTable columns={matchColumns(tour)} rows={r.matches} rowKey={(m) => m.source_key} />
            </Section>
          ))}
          {!draw && (
            <Section title="Results so far" id="ted-all">
              <SortableTable columns={matchColumns(tour)} rows={[...data.matches].sort((a, b) => b.round_order - a.round_order)} rowKey={(m) => m.source_key} />
            </Section>
          )}
          <p className="text-xs text-ink-500">{`The draw is rebuilt from results, so byes and withdrawals before a match show as empty boxes. Rankings are as at the match; odds are the pre-match average market price. ${DATA_NOTE}`}</p>
        </>
      )}
    </article>
  );
}

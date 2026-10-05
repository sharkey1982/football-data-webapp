// ============================================================================
// src/pages/international/IntlTournamentsPage.tsx
//
// /international/tournaments -- every World Cup (1930-2026), Euro (1960-2024)
// and UEFA Nations League (2018/19-), with hosts, winner and runner-up; each
// edition links to its own page. /international/tournaments/:competition
// shows one competition's editions only.
// ============================================================================

import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import { IntlHeader, Section, TeamLink } from '../../components/intl/IntlBits';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { INTL_TOURNAMENTS_PATH, editionPathOf, intlTournamentPath, loadIntlEditions } from '../../lib/intlApi';
import { DATA_NOTE, TOURNAMENTS, editionLabel, tournamentBySlug, type EditionSummary } from '../../lib/intlStats';

function titleLeaders(rows: EditionSummary[]): string {
  const n = new Map<string, number>();
  for (const e of rows) if (e.winner) n.set(e.winner, (n.get(e.winner) ?? 0) + 1);
  const sorted = [...n.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return '';
  const top = sorted.filter((s) => s[1] === sorted[0][1]).map((s) => s[0]);
  return `${top.join(' and ')} ${top.length > 1 ? 'have' : 'has'} won it most: ${sorted[0][1]} time${sorted[0][1] === 1 ? '' : 's'}.`;
}

export default function IntlTournamentsPage() {
  const { competition } = useParams();
  const only = competition ? tournamentBySlug(competition) : null;
  const { data, failed, loading } = useKeyedFetch('editions', () => loadIntlEditions());
  useDocumentHead({
    title: only ? `Every ${only.short}: winners, hosts and results` : 'International tournaments: every World Cup, Euro and Nations League',
    description: only
      ? `Every ${only.competition} edition with its hosts, winner and runner-up, and each one's groups, knockouts and scorers.`
      : 'Every World Cup since 1930, every Euro since 1960 and every UEFA Nations League: winners, hosts, groups, knockouts and scorers.',
    path: only ? intlTournamentPath(only.slug) : INTL_TOURNAMENTS_PATH,
  });
  const byComp = useMemo(() => TOURNAMENTS.filter((t) => !only || t.slug === only.slug).map((t) => ({ t, rows: (data ?? []).filter((e) => e.competition === t.competition) })), [data, only]);

  const columns: Column<EditionSummary>[] = [
    { key: 'ed', label: 'Edition', render: (e) => <Link to={editionPathOf(e)} className="text-pitch-800 underline underline-offset-2">{editionLabel(e.label)}</Link>, sortValue: (e) => e.season_start },
    { key: 'host', label: 'Hosts', render: (e) => (e.hosts.length ? e.hosts.join(', ') : '–'), sortValue: (e) => e.hosts.join(', '), className: 'hidden sm:table-cell' },
    { key: 'w', label: 'Winner', render: (e) => (e.winner ? <TeamLink slug={e.winner_slug} name={e.winner} bold /> : <span className="text-ink-500">To be decided</span>), sortValue: (e) => e.winner },
    { key: 'r', label: 'Runner-up', render: (e) => (e.runner_up ? <TeamLink slug={e.runner_up_slug} name={e.runner_up} /> : '–'), sortValue: (e) => e.runner_up, className: 'hidden md:table-cell' },
    { key: 'n', label: 'Teams', render: (e) => e.teams, sortValue: (e) => e.teams, align: 'right', descFirst: true, className: 'hidden md:table-cell' },
    { key: 'g', label: 'Goals/game', render: (e) => (e.matches ? (e.goals / e.matches).toFixed(2) : '–'), sortValue: (e) => (e.matches ? e.goals / e.matches : null), align: 'right', descFirst: true },
  ];

  return (
    <article className="space-y-6">
      <IntlHeader title={only ? only.short : 'Tournaments'} crumb={only ? { to: INTL_TOURNAMENTS_PATH, label: 'Tournaments' } : undefined}>
        <p className="text-ink-700 max-w-prose">Every World Cup, Euro and UEFA Nations League: the winners, and each edition’s groups, knockouts and top scorers.</p>
      </IntlHeader>
      {failed && <p className="text-ink-700">Tournaments are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data &&
        byComp.map(({ t, rows }) => (
          <Section key={t.slug} title={t.competition} id={`intl-${t.slug}`} testId={`intl-tournament-${t.slug}`}>
            <p className="text-sm text-ink-900">{`${rows.length} edition${rows.length === 1 ? '' : 's'}. ${titleLeaders(rows)}`}</p>
            <SortableTable columns={columns} rows={rows} rowKey={(e) => e.edition_key} initialSort={{ key: 'ed', dir: 'desc' }} caption={t.competition} />
          </Section>
        ))}
      <p className="text-xs text-ink-500">{`Hosts: countries where a team played at home. Winners: the last game of the final (so a replayed final counts the replay); the 1950 World Cup was decided by a final group. ${DATA_NOTE}`}</p>
    </article>
  );
}

// ============================================================================
// src/pages/international/IntlTournamentsPage.tsx
//
// /international/tournaments -- every major international tournament: the
// World Cup, the continental championships (Euro, Copa América, AFCON, Asian
// Cup, Gold Cup), the UEFA Nations League and the Confederations Cup. The
// overview is a card per tournament (holders, most titles) and the race for
// the most major titles since 1916. /international/tournaments/:competition
// shows one: its roll of honour as bars, its own titles race and every
// edition with hosts, winner and runner-up.
// ============================================================================

import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import Timelapse from '../../components/Timelapse';
import { ChipGroup, IntlHeader, Section, TeamLink } from '../../components/intl/IntlBits';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { intlTournamentHead } from '../../lib/intlSeo';
import { INTL_TOURNAMENTS_PATH, editionPathOf, intlTeamPath, intlTournamentPath, loadIntlEditions } from '../../lib/intlApi';
import { DATA_NOTE, TOURNAMENTS, editionLabel, titlesRace, tournamentBySlug, type EditionSummary, type Tournament, sideTitle, INTL_GENDER } from '../../lib/intlStats';

type Leader = { team: string; slug: string | null; n: number; last: string };

function rollOfHonour(rows: EditionSummary[]): Leader[] {
  const n = new Map<string, Leader>();
  for (const e of rows) {
    if (!e.winner) continue;
    const cur = n.get(e.winner) ?? { team: e.winner, slug: e.winner_slug, n: 0, last: '' };
    cur.n++;
    if (e.label > cur.last) cur.last = e.label;
    n.set(e.winner, cur);
  }
  return [...n.values()].sort((a, b) => b.n - a.n || b.last.localeCompare(a.last));
}

function HonourBars({ leaders, testId }: { leaders: Leader[]; testId?: string }) {
  const max = Math.max(1, ...leaders.map((l) => l.n));
  return (
    <ol className="space-y-1" data-testid={testId}>
      {leaders.map((l) => (
        <li key={l.team} className="grid grid-cols-[8.5rem_1fr] sm:grid-cols-[10rem_1fr] items-center gap-2 text-sm">
          <span className="truncate"><TeamLink slug={l.slug} name={l.team} /></span>
          <span className="flex items-center gap-2">
            <span className="h-4 rounded-sm bg-amber-500" style={{ width: `${(100 * l.n) / max}%`, minWidth: '0.5rem' }} aria-hidden />
            <span className="font-mono text-xs tabular-nums whitespace-nowrap">{l.n}<span className="text-ink-500">{` · last ${editionLabel(l.last)}`}</span></span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function TournamentCard({ t, rows }: { t: Tournament; rows: EditionSummary[] }) {
  const latest = rows.filter((e) => e.winner).sort((a, b) => b.season_start - a.season_start)[0];
  const next = rows.filter((e) => !e.winner).sort((a, b) => a.season_start - b.season_start)[0];
  const top = rollOfHonour(rows)[0];
  return (
    <Link to={intlTournamentPath(t.slug)} className="block rounded-lg border border-chalk-300 bg-white p-4 hover:border-pitch-600 hover:shadow-sm transition-shadow" data-testid={`intl-tournament-${t.slug}`}>
      <p className="text-[11px] uppercase tracking-widest text-pitch-700 font-mono">{t.confederation === 'FIFA' ? 'Worldwide' : t.confederation}</p>
      <h2 className="font-display uppercase tracking-wide text-xl text-ink-900">{t.competition}</h2>
      <p className="text-xs text-ink-500">{`${rows.length} editions since ${Math.min(...rows.map((e) => e.season_start))}`}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-ink-500">{next ? 'Last winners' : 'Holders'}</dt>
          <dd className="font-semibold text-ink-900">{latest ? `${latest.winner} (${editionLabel(latest.label)})` : '–'}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-ink-500">Most titles</dt>
          <dd className="font-semibold text-ink-900">{top ? `${top.team} (${top.n})` : '–'}</dd>
        </div>
      </dl>
      {next && <p className="mt-2 text-xs text-pitch-800">{`Next: ${editionLabel(next.label)}`}</p>}
    </Link>
  );
}

export default function IntlTournamentsPage() {
  const { competition } = useParams();
  const navigate = useNavigate();
  const only = competition ? tournamentBySlug(competition) : null;
  const { data, failed, loading } = useKeyedFetch('editions', () => loadIntlEditions());
  const onlyHead = only ? intlTournamentHead(only) : null;
  useDocumentHead({
    title: onlyHead?.title ?? sideTitle(INTL_GENDER === 'women' ? 'International tournaments: World Cup, Olympics, Euro and more' : 'International tournaments: World Cup, Euro, Copa América, AFCON and more'),
    description:
      onlyHead?.description ??
      INTL_GENDER === 'women' ? 'Every Women’s World Cup, Olympics, Euro, Copa América, WAFCON, Asian Cup, CONCACAF W Championship and Nations League: winners, hosts, groups and knockouts.' : 'Every World Cup, Euro, Copa América, Africa Cup of Nations, Asian Cup, Gold Cup, Nations League and Confederations Cup: winners, hosts, groups, knockouts and scorers.',
    path: only ? intlTournamentPath(only.slug) : INTL_TOURNAMENTS_PATH,
  });

  const rowsOf = (t: Tournament) => (data ?? []).filter((e) => e.competition === t.competition);
  const rows = useMemo(() => (only ? (data ?? []).filter((e) => e.competition === only.competition) : []), [data, only]);
  const leaders = useMemo(() => rollOfHonour(rows), [rows]);
  const race = useMemo(() => titlesRace(only ? rows : data ?? []), [only, rows, data]);

  const columns: Column<EditionSummary>[] = [
    { key: 'ed', label: 'Edition', render: (e) => <Link to={editionPathOf(e)} className="text-pitch-800 underline underline-offset-2">{editionLabel(e.label)}</Link>, sortValue: (e) => e.season_start },
    { key: 'host', label: 'Hosts', render: (e) => (e.hosts.length ? e.hosts.join(', ') : '–'), sortValue: (e) => e.hosts.join(', '), className: 'hidden sm:table-cell' },
    { key: 'w', label: 'Winner', render: (e) => (e.winner ? <TeamLink slug={e.winner_slug} name={e.winner} bold /> : <span className="text-ink-500">To be decided</span>), sortValue: (e) => e.winner },
    { key: 'r', label: 'Runner-up', render: (e) => (e.runner_up ? <TeamLink slug={e.runner_up_slug} name={e.runner_up} /> : '–'), sortValue: (e) => e.runner_up, className: 'hidden md:table-cell' },
    { key: 'n', label: 'Teams', render: (e) => e.teams, sortValue: (e) => e.teams, align: 'right', descFirst: true, className: 'hidden md:table-cell' },
    { key: 'g', label: 'Goals/game', render: (e) => (e.matches ? (e.goals / e.matches).toFixed(2) : '–'), sortValue: (e) => (e.matches ? e.goals / e.matches : null), align: 'right', descFirst: true },
  ];

  const chips = [{ key: '', label: 'All' }, ...TOURNAMENTS.map((t) => ({ key: t.slug as string, label: t.short }))];
  const raceSeries = race.series.map((s) => ({ id: s.team, name: s.team, values: s.values, href: s.slug ? intlTeamPath(s.slug) : undefined }));

  return (
    <article className="space-y-6">
      <IntlHeader title={only ? only.competition : 'Tournaments'} crumb={only ? { to: INTL_TOURNAMENTS_PATH, label: 'Tournaments' } : undefined}>
        <p className="text-ink-700 max-w-prose">
          {only
            ? `Every ${only.competition}: the roll of honour, the race for titles, and each edition’s groups, knockouts and top scorers.`
            : INTL_GENDER === 'women' ? 'The World Cup, the Olympics, every continental championship and the Nations League: winners, hosts, and every edition round by round.' : 'The World Cup, every continental championship, the Nations League and the Confederations Cup: winners, hosts, and every edition round by round.'}
        </p>
      </IntlHeader>
      <ChipGroup options={chips} value={only?.slug ?? ''} onChange={(k) => navigate(k ? intlTournamentPath(k) : INTL_TOURNAMENTS_PATH)} label="Tournament" testId="intl-tournament-chips" />
      {failed && <p className="text-ink-700">Tournaments are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && !only && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TOURNAMENTS.map((t) => <TournamentCard key={t.slug} t={t} rows={rowsOf(t)} />)}
          </div>
          <Section title="The race for major titles" id="intl-titles-race" testId="intl-titles-race">
            <p className="text-sm text-ink-700 max-w-prose">{INTL_GENDER === 'women' ? 'Every World Cup, Olympics, continental championship and Nations League won, added up year by year since the first Asian Cup in 1975. Press play.' : 'Every World Cup, continental championship, Nations League and Confederations Cup won, added up year by year since the first Copa América in 1916. Press play.'}</p>
            <Timelapse series={raceSeries} frameLabel={(i) => String(race.years[i])} measure="Major titles" top={10} stepMs={450} />
          </Section>
        </>
      )}

      {data && only && (
        <>
          <Section title="Roll of honour" id="intl-honours" testId="intl-honours">
            <p className="text-sm text-ink-900">{`${rows.length} edition${rows.length === 1 ? '' : 's'}, ${leaders.length} different winner${leaders.length === 1 ? '' : 's'}.`}</p>
            <HonourBars leaders={leaders} testId="intl-honour-bars" />
          </Section>
          {race.years.length > 2 && (
            <Section title="Titles race" id="intl-race" testId="intl-race">
              <Timelapse series={raceSeries} frameLabel={(i) => `${only.short} ${race.years[i]}`} measure="Titles" top={8} stepMs={600} />
            </Section>
          )}
          <Section title="Every edition" id={`intl-${only.slug}`} testId={`intl-tournament-${only.slug}`}>
            <SortableTable columns={columns} rows={rows} rowKey={(e) => e.edition_key} initialSort={{ key: 'ed', dir: 'desc' }} caption={only.competition} />
          </Section>
        </>
      )}
      <p className="text-xs text-ink-500">{`Hosts: countries where a team played at home. Winners: the last game of the final (a replayed final counts the replay), or the top of a final group, or the play-off that broke a tie; a few early editions decided off the field or by games the results file doesn’t mark are taken from the official record. Rounds for continental tournaments are worked out from the results. ${DATA_NOTE}`}</p>
    </article>
  );
}

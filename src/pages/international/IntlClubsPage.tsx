// ============================================================================
// src/pages/international/IntlClubsPage.tsx
//
// /international/clubs -- where the internationals play, from every nation's
// current squad (intl_squad_players, read daily from Wikipedia):
//   * clubs supplying the most players to national squads, and to whom;
//   * league countries holding the most internationals, and how many of them
//     are foreign;
//   * every squad by how many play abroad and the average ClubElo rating of
//     their clubs;
//   * ClubElo's top clubs (mainly European) with their internationals.
// ============================================================================

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import { ChipGroup, IntlHeader, Section, TeamLink } from '../../components/intl/IntlBits';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { INTL_CLUBS_PATH, loadIntlClubs } from '../../lib/intlApi';
import { CONFEDERATIONS, type ClubCallup, type ClubEloRow, type LeagueExport, type SquadClubStrength } from '../../lib/intlStats';

const clubLink = (name: string, slug: string | null) => (slug ? <Link to={`/football/teams/${slug}`} className="hover:underline">{name}</Link> : <>{name}</>);

function ClubBars({ clubs }: { clubs: ClubCallup[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...clubs.map((c) => c.players));
  return (
    <ol className="space-y-1" data-testid="intl-club-bars">
      {clubs.map((c, i) => (
        <li key={c.club_key} className="text-sm">
          <button type="button" onClick={() => setOpen(open === c.club_key ? null : c.club_key)} aria-expanded={open === c.club_key}
            className="grid w-full grid-cols-[1.5rem_9rem_1fr] sm:grid-cols-[1.5rem_12rem_1fr] items-center gap-2 text-left hover:bg-chalk-100 rounded px-1">
            <span className="font-mono text-xs text-ink-500 text-right">{i + 1}</span>
            <span className="truncate text-ink-900">{c.club}<span className="ml-1 text-[11px] text-ink-500">{c.league_country ?? ''}</span></span>
            <span className="flex items-center gap-2">
              <span className="h-3.5 rounded-sm bg-pitch-700" style={{ width: `${(100 * c.players) / max}%`, minWidth: '0.4rem' }} aria-hidden />
              <span className="font-mono text-xs whitespace-nowrap">{`${c.players} · ${c.nations} nation${c.nations === 1 ? '' : 's'}`}</span>
            </span>
          </button>
          {open === c.club_key && (
            <div className="ml-8 mt-1 mb-2 text-xs text-ink-700 space-y-1">
              <p>{c.club_slug ? clubLink(`${c.club}: club page`, c.club_slug) : null}{c.club_elo ? ` · ClubElo ${Math.round(c.club_elo)} (rank ${c.club_elo_rank})` : ''}</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                {c.callups.map((p) => <li key={`${p.team}-${p.player}`}>{`${p.player} `}<TeamLink slug={p.slug} name={`(${p.team})`} /></li>)}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function IntlClubsPage() {
  const { data, failed, loading } = useKeyedFetch('intl-clubs', () => loadIntlClubs());
  const [conf, setConf] = useState('');
  useDocumentHead({
    title: 'Where the internationals play: club call-ups for every national squad',
    description: 'Which clubs and leagues supply the most players to national teams this window, how many of each squad play abroad, and how strong their clubs are.',
    path: INTL_CLUBS_PATH,
  });

  const strength = useMemo(() => (data?.strength ?? []).filter((s) => !conf || s.confederation === conf), [data, conf]);
  const totals = useMemo(() => {
    const s = data?.strength ?? [];
    const players = s.reduce((a, x) => a + x.players, 0);
    const abroad = s.reduce((a, x) => a + x.abroad, 0);
    const allAbroad = s.filter((x) => x.players > 0 && x.at_home === 0).length;
    return { players, abroad, allAbroad, squads: s.length };
  }, [data]);

  const leagueCols: Column<LeagueExport>[] = [
    { key: 'c', label: 'League country', render: (l) => l.league_country, sortValue: (l) => l.league_country },
    { key: 'p', label: 'Internationals', render: (l) => l.players, sortValue: (l) => l.players, align: 'right', descFirst: true },
    { key: 'f', label: 'From abroad', render: (l) => `${l.foreign_players} (${Math.round((100 * l.foreign_players) / Math.max(1, l.players))}%)`, sortValue: (l) => l.foreign_players, align: 'right', descFirst: true },
    { key: 'n', label: 'Nations', render: (l) => l.nations, sortValue: (l) => l.nations, align: 'right', descFirst: true, className: 'hidden sm:table-cell' },
    { key: 'k', label: 'Clubs', render: (l) => l.clubs, sortValue: (l) => l.clubs, align: 'right', descFirst: true, className: 'hidden sm:table-cell' },
  ];
  const strengthCols: Column<SquadClubStrength>[] = [
    { key: 't', label: 'Nation', render: (s) => <TeamLink slug={s.slug} name={s.team} />, sortValue: (s) => s.team },
    { key: 'e', label: 'Avg club Elo', render: (s) => (s.avg_club_elo != null && s.rated >= Math.max(3, s.players / 2) ? Math.round(s.avg_club_elo) : '–'), sortValue: (s) => (s.rated >= Math.max(3, s.players / 2) ? s.avg_club_elo : null), align: 'right', descFirst: true },
    { key: 'r', label: 'Rated', render: (s) => `${s.rated}/${s.players}`, sortValue: (s) => s.rated / Math.max(1, s.players), align: 'right', descFirst: true, className: 'hidden sm:table-cell' },
    { key: 'a', label: 'Abroad', render: (s) => `${s.abroad} (${Math.round((100 * s.abroad) / Math.max(1, s.players))}%)`, sortValue: (s) => s.abroad / Math.max(1, s.players), align: 'right', descFirst: true },
    { key: 'l', label: 'Leagues', render: (s) => s.league_countries, sortValue: (s) => s.league_countries, align: 'right', descFirst: true, className: 'hidden md:table-cell' },
  ];
  const eloCols: Column<ClubEloRow>[] = [
    { key: 'r', label: 'Rank', render: (c) => c.rank, sortValue: (c) => c.rank, align: 'right' },
    { key: 'c', label: 'Club', render: (c) => clubLink(c.club, c.club_slug), sortValue: (c) => c.club },
    { key: 'k', label: 'Country', render: (c) => c.country ?? '', sortValue: (c) => c.country, className: 'hidden sm:table-cell' },
    { key: 'e', label: 'Elo', render: (c) => Math.round(c.elo), sortValue: (c) => c.elo, align: 'right', descFirst: true },
    { key: 'i', label: 'Internationals', render: (c) => c.internationals || '', sortValue: (c) => c.internationals, align: 'right', descFirst: true },
  ];

  return (
    <article className="space-y-8">
      <IntlHeader title="Club call-ups">
        <p className="text-ink-700 max-w-prose">Where the players in every national squad play their club football: the clubs and leagues supplying the most internationals, and how many of each squad play abroad.</p>
      </IntlHeader>
      {failed && <p className="text-ink-700">Club call-ups are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && (
        <>
          <p className="text-sm text-ink-900 max-w-prose" data-testid="intl-clubs-summary">
            {`${totals.players.toLocaleString('en-GB')} players in ${totals.squads} current squads; ${Math.round((100 * totals.abroad) / Math.max(1, totals.players))}% play outside their own country, and ${totals.allAbroad} squads have no player at home.`}
          </p>

          <Section title="Clubs supplying the most internationals" id="intl-clubs-top" testId="intl-clubs-top">
            <p className="text-xs text-ink-500">Players in current national squads. Tap a club for who they are.</p>
            <ClubBars clubs={data.clubs.slice(0, 30)} />
          </Section>

          <Section title="Leagues" id="intl-clubs-leagues">
            <SortableTable columns={leagueCols} rows={data.leagues} rowKey={(l) => l.league_country} initialSort={{ key: 'p', dir: 'desc' }} caption="Internationals by league country" testId="intl-clubs-leagues" />
          </Section>

          <Section title="Squads: abroad and club strength" id="intl-clubs-strength">
            <ChipGroup options={[{ key: '', label: 'All' }, ...CONFEDERATIONS.map((c) => ({ key: c, label: c }))]} value={conf} onChange={setConf} label="Confederation" testId="intl-clubs-conf" />
            <SortableTable columns={strengthCols} rows={strength} rowKey={(s) => s.team} initialSort={{ key: 'e', dir: 'desc' }} caption="National squads by club strength" testId="intl-clubs-strength" />
            <p className="text-xs text-ink-500">Average club Elo: the mean ClubElo rating of squad players’ clubs, shown when at least half the squad’s clubs are rated. ClubElo rates mainly European clubs, so squads based in the Americas, Asia and Africa show “–”.</p>
          </Section>

          {data.elo.length > 0 && (
            <Section title="Top clubs by ClubElo" id="intl-clubs-elo">
              <SortableTable columns={eloCols} rows={data.elo.slice(0, 50)} rowKey={(c) => c.club} initialSort={{ key: 'r', dir: 'asc' }} caption="ClubElo top 50" testId="intl-clubs-elo" />
              <p className="text-xs text-ink-500">{`Ratings from ClubElo (clubelo.com), the Elo method applied to club football, mainly European; as of ${data.elo[0].fetched_on}. Internationals: players in current national squads.`}</p>
            </Section>
          )}
          <p className="text-xs text-ink-500">Squads and clubs from each national team’s Wikipedia page (CC BY-SA), read daily. A club’s country is the country of the league it plays in.</p>
        </>
      )}
    </article>
  );
}

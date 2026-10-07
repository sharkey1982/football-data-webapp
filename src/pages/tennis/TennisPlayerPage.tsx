// ============================================================================
// src/pages/tennis/TennisPlayerPage.tsx
//
// /tennis/players/:tour/:slug -- one player: record, titles and finals by
// year, splits by surface, level and season, best wins (by opponent rank and
// by odds) and latest matches. Static, indexed pages for players who pass
// isIndexedPlayer (active regulars, any title, or a long career); everyone
// else client-side (noindex).
// Phase 3: country, age and playing hand (Wikidata), and form by surface and
// at each Grand Slam for chosen seasons (PlayerForm).
// ============================================================================

import { useNoindex } from '../../hooks/useNoindex';
import React, { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import Opponents from '../../components/tennis/Opponents';
import TitlesByLevel from '../../components/tennis/TitlesByLevel';
import { Country, PlayerLink, Section, TennisHeader, TournamentCell } from '../../components/tennis/TennisBits';
import PlayerForm from '../../components/tennis/PlayerForm';
import { ageOn } from '../../lib/tennisEvents';
import { DEFAULT_PAIR } from '../../lib/tennisModel';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { loadTennisPlayer, tennisH2HCanonicalPath, tennisPlayerPath, tennisPlayersPath, tennisSeasonPath, type TennisPlayerData } from '../../lib/tennisApi';
import { DATA_NOTE, parseTour, pctLabel, playerSentence, recordLabel, scoreLabel, shortDate, isIndexedPlayer, type NotableWin, type SplitRow, type TennisMatch, type TitleRow, type Tour } from '../../lib/tennisStats';

function splitColumns(label: string, link?: (key: string) => string): Column<SplitRow>[] {
  return [
    { key: 'key', label, render: (r) => (link ? <Link to={link(r.key)} className="hover:underline">{r.key}</Link> : r.key), sortValue: (r) => r.key },
    { key: 'record', label: 'W–L', render: (r) => recordLabel(r.won, r.lost), sortValue: (r) => r.won + r.lost, align: 'right', descFirst: true },
    { key: 'pct', label: 'Win %', render: (r) => pctLabel(r.pct), sortValue: (r) => r.pct, align: 'right', descFirst: true },
    { key: 'titles', label: 'Titles', render: (r) => r.titles, sortValue: (r) => r.titles, align: 'right', descFirst: true },
  ];
}

/** "World ranking" tile label: as at the start of their latest tournament. */
function worldRankLabel(player: TennisPlayerData['player'], matches?: TennisMatch[]): string {
  if (!player.latest_rank_date) return 'World ranking';
  const last = matches?.find((m) => m.match_date === player.latest_rank_date);
  return `World ranking (${last ? `${last.tournament} ${last.year}` : shortDate(player.latest_rank_date)})`;
}

function opponent(m: TennisMatch, playerId: number) {
  const won = m.winner_id === playerId;
  return won ? { name: m.loser, slug: m.loser_slug, rank: m.l_rank, won } : { name: m.winner, slug: m.winner_slug, rank: m.w_rank, won };
}

function matchColumns(tour: Tour, playerId: number): Column<TennisMatch>[] {
  return [
    { key: 'date', label: 'Date', render: (m) => shortDate(m.match_date), sortValue: (m) => m.match_date, descFirst: true },
    { key: 'tournament', label: 'Tournament', render: (m) => <TournamentCell name={m.tournament} level={m.level} round={m.round} />, sortValue: (m) => m.tournament },
    { key: 'round', label: 'Round', render: (m) => m.round, sortValue: (m) => m.round_order, className: 'hidden sm:table-cell' },
    {
      key: 'opponent',
      label: 'Opponent',
      render: (m) => {
        const o = opponent(m, playerId);
        return <PlayerLink tour={tour} slug={o.slug} name={o.name} rank={o.rank} />;
      },
      sortValue: (m) => opponent(m, playerId).name,
    },
    { key: 'result', label: 'Result', render: (m) => (m.winner_id === playerId ? 'Won' : 'Lost'), sortValue: (m) => (m.winner_id === playerId ? 1 : 0) },
    { key: 'score', label: 'Score', render: (m) => scoreLabel(m), className: 'hidden sm:table-cell' },
  ];
}

function winColumns(tour: Tour): Column<NotableWin>[] {
  return [
    { key: 'date', label: 'Date', render: (w) => shortDate(w.match.match_date), sortValue: (w) => w.match.match_date, descFirst: true },
    { key: 'opponent', label: 'Beat', render: (w) => <PlayerLink tour={tour} slug={w.match.loser_slug} name={w.match.loser} />, sortValue: (w) => w.match.loser },
    { key: 'where', label: 'Tournament', render: (w) => <TournamentCell name={w.match.tournament} level={w.match.level} round={w.match.round} />, sortValue: (w) => w.match.tournament },
    { key: 'rank', label: 'Their rank', render: (w) => w.opponentRank ?? '–', sortValue: (w) => w.opponentRank, align: 'right' },
    { key: 'round', label: 'Round', render: (w) => w.match.round, sortValue: (w) => w.match.round_order, className: 'hidden sm:table-cell' },
    { key: 'odds', label: 'Odds', render: (w) => (w.odds != null ? w.odds.toFixed(2) : '–'), sortValue: (w) => w.odds, align: 'right', descFirst: true },
  ];
}

export default function TennisPlayerPage({ initialData }: { initialData?: TennisPlayerData }) {
  const params = useParams<{ tour: string; slug: string }>();
  const tour = parseTour(params.tour) ?? initialData?.player.tour ?? 'ATP';
  const slug = params.slug ?? initialData?.player.slug ?? '';
  const key = `${tour}/${slug}`;
  const { data, failed, loading } = useKeyedFetch(
    slug ? key : null,
    () => loadTennisPlayer(tour, slug),
    initialData ? { key: `${initialData.player.tour}/${initialData.player.slug}`, data: initialData } : undefined
  );
  const s = data?.summary;
  useDocumentHead({
    title: s ? `${s.name}: ${tour} record, titles and results` : `${tour} player`,
    description: s ? playerSentence(s) : `A ${tour} player's tour-level record.`,
    path: tennisPlayerPath(tour, slug),
  });
  // Only players with a static page are meant to be indexed (design doc, section 7).
  const noindex = data ? !isIndexedPlayer(data.player) : false;
  useEffect(() => {
    if (!noindex) return;
    const tag = document.createElement('meta');
    tag.setAttribute('name', 'robots');
    tag.setAttribute('content', 'noindex');
    document.head.appendChild(tag);
    return () => tag.remove();
  }, [noindex]);

  const titleColumns: Column<TitleRow>[] = [
    { key: 'year', label: 'Season', render: (r) => <Link to={tennisSeasonPath(tour, r.year)} className="hover:underline">{r.year}</Link>, sortValue: (r) => r.year, descFirst: true },
    { key: 'titles', label: 'Titles', render: (r) => (r.titles.length ? r.titles.join(', ') : '–'), sortValue: (r) => r.titles.length, descFirst: true },
    { key: 'runnerUp', label: 'Runner-up', render: (r) => (r.runnerUp.length ? r.runnerUp.join(', ') : '–'), sortValue: (r) => r.runnerUp.length, descFirst: true, className: 'hidden sm:table-cell' },
  ];

  useNoindex(!loading && !failed && !data);
  return (
    <article className="space-y-6">
      <TennisHeader title={s?.name ?? 'Player'} crumb={{ to: tennisPlayersPath(tour), label: 'Your Player' }}>
        {data && <PlayerBio player={data.player} />}
        {s && <p className="text-ink-900 max-w-prose" data-testid="tennis-player-story">{playerSentence(s)}</p>}
        {data && (
          <p className="text-sm">
            <Link to={tennisH2HCanonicalPath(tour, data.player.slug, DEFAULT_PAIR[tour][0] === data.player.slug ? DEFAULT_PAIR[tour][1] : DEFAULT_PAIR[tour][0])} className="text-pitch-800 underline underline-offset-2" data-testid="tennis-player-h2h-link">
              Head to head with another player
            </Link>
          </p>
        )}
      </TennisHeader>
      {failed && <p className="text-ink-700">This player is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {!loading && !failed && !data && <p className="text-ink-700">No {tour} player with that name. <Link to={tennisPlayersPath(tour)} className="underline">Find a player</Link>.</p>}
      {data && s && (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="tennis-player-tiles">
            {[
              ['Record', recordLabel(s.won, s.lost)],
              ['Win %', pctLabel(s.won + s.lost ? s.won / (s.won + s.lost) : null)],
              ['Titles', `${s.titles}`],
              ['Finals', `${s.finals}`],
              [worldRankLabel(data.player, data.matches), data.player.latest_rank ? `${data.player.latest_rank}` : '–'],
              ['Best world ranking', s.bestRank ? `${s.bestRank.rank}` : '–'],
            ].map(([k, v]) => (
              <div key={k} className="border border-chalk-300 rounded-lg bg-white px-3 py-2">
                <dt className="text-xs text-ink-500">{k}</dt>
                <dd className="font-display text-2xl text-ink-900">{v}</dd>
              </div>
            ))}
          </dl>
          {s.season && (
            <p className="text-sm text-ink-700">
              <Link to={tennisSeasonPath(tour, s.season.year)} className="underline underline-offset-2">{s.season.year}</Link>
              {`: ${recordLabel(s.season.won, s.season.lost)}, ${s.season.titles} title${s.season.titles === 1 ? '' : 's'}.`}
            </p>
          )}

          {data.matches && data.matches.length > 0 && <PlayerForm tour={tour} playerId={data.player.player_id} matches={data.matches} />}

          <Section title="Latest matches" id="tp-recent">
            <SortableTable columns={matchColumns(tour, data.player.player_id)} rows={s.recent} rowKey={(m) => m.source_key} testId="tennis-player-recent" />
          </Section>

          {data.matches && data.matches.length > 0 && (
            <Opponents tour={tour} playerId={data.player.player_id} playerSlug={data.player.slug} name={s.name} matches={data.matches} />
          )}

          {s.titleYears.length > 0 && (
            <Section title="Titles and finals" id="tp-titles">
              <SortableTable columns={titleColumns} rows={s.titleYears} rowKey={(r) => String(r.year)} initialSort={{ key: 'year', dir: 'desc' }} testId="tennis-player-titles" />
            </Section>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Section title="By surface" id="tp-surface">
              <SortableTable columns={splitColumns('Surface')} rows={s.bySurface} rowKey={(r) => r.key} />
            </Section>
            <Section title="By level" id="tp-level">
              <TitlesByLevel rows={s.byLevel} name={s.name} />
              <SortableTable columns={splitColumns('Level')} rows={s.byLevel} rowKey={(r) => r.key} />
            </Section>
          </div>

          <Section title="By season" id="tp-season">
            <SortableTable columns={splitColumns('Season', (y) => tennisSeasonPath(tour, Number(y)))} rows={s.byYear} rowKey={(r) => r.key} />
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Best wins by opponent's ranking" id="tp-best-rank">
              <SortableTable columns={winColumns(tour)} rows={s.bestWinsByRank} rowKey={(w) => w.match.source_key} empty="No ranked opponents beaten yet." />
            </Section>
            <Section title="Biggest wins against the odds" id="tp-best-odds">
              <SortableTable columns={winColumns(tour)} rows={s.bestWinsByOdds} rowKey={(w) => w.match.source_key} empty="No odds recorded for these wins." />
            </Section>
          </div>
          <p className="text-xs text-ink-500">{`World rankings are the official ATP/WTA ranking at the start of each tournament (not the seeding). Odds are the winner's pre-match average market price (Bet365 or Pinnacle before 2010). ${DATA_NOTE}${data.player.wikidata_qid || data.player.country ? ' Player details: Wikidata (CC0).' : ''}`}</p>
        </>
      )}
    </article>
  );
}

/** Full name, country, age and playing hand, when Wikidata has them. */
function PlayerBio({ player }: { player: TennisPlayerData['player'] }) {
  const today = new Date().toISOString().slice(0, 10);
  // Not seen for a year: show age at the last match rather than today's.
  const retired = player.last_match < new Date(Date.parse(`${today}T12:00:00Z`) - 365 * 86400000).toISOString().slice(0, 10);
  const parts: React.ReactNode[] = [];
  if (player.full_name && player.full_name !== player.name) parts.push(<span key="n" className="text-ink-900">{player.full_name}</span>);
  if (player.country) parts.push(<Country key="c" code={player.country} />);
  if (player.birth_date) {
    const age = ageOn(player.birth_date, retired ? player.last_match : today);
    parts.push(<span key="a">{retired ? `${age} at last match` : `age ${age}`}</span>);
  }
  if (player.hand) parts.push(<span key="h">{`${player.hand.toLowerCase()}-handed`}</span>);
  if (!parts.length) return null;
  return (
    <p className="text-sm text-ink-700 flex flex-wrap gap-x-2" data-testid="tennis-player-bio">
      {parts.map((p, i) => (
        <span key={i}>{i > 0 && <span aria-hidden="true" className="text-ink-500 mr-2">·</span>}{p}</span>
      ))}
    </p>
  );
}

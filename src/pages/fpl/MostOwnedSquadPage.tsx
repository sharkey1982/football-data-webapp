// ============================================================================
// src/pages/fpl/MostOwnedSquadPage.tsx
//
// /fpl/most-owned: the most-owned legal FPL squad (the "template"), what it
// costs, the XI our projections would pick from it, how ownership moved
// since the last deadline, and its weak spots. Rules and method in
// src/lib/fplMostOwned.ts.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import SortableTable, { type Column } from '../../components/SortableTable';
import SquadPitch from '../../components/fpl/SquadPitch';
import { STATUS_LABEL } from '../../lib/injuryApi';
import { todayUk } from '../../lib/answerFirst';
import { formatMatchDateWithYear } from '../../lib/formatDate';
import type { FplOptimizerPlayer, FplOptimizerPosition } from '../../lib/fplOptimizerApi';
import { budgetText, getMostOwnedData, money, pct, type MostOwnedData, type OwnershipMove, type TemplatePlayer } from '../../lib/fplMostOwned';

export const MOST_OWNED_TITLE = 'Most-owned FPL squad — the template team';
export const MOST_OWNED_DESCRIPTION =
  'The 15 most-owned Fantasy Premier League players that make a legal squad, what it costs, the XI and captain our projections pick from it, ownership changes since the deadline and its weak spots.';

function PlayerLink({ p }: { p: { name: string; slug: string | null } }) {
  return p.slug ? (
    <Link to={`/fpl/players/${p.slug}`} className="text-pitch-800 underline underline-offset-2">
      {p.name}
    </Link>
  ) : (
    <>{p.name}</>
  );
}

function StatusCell({ p }: { p: TemplatePlayer }) {
  if (p.status === 'a') return <span className="text-ink-500">Available</span>;
  const tone = p.status === 'd' ? 'bg-amber-500 text-ink-900' : 'bg-loss-700 text-chalk-100';
  return (
    <span title={p.news ?? undefined} className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${tone}`}>
      {STATUS_LABEL[p.status] ?? p.status}
      {p.status === 'd' && p.chance != null ? ` ${p.chance}%` : ''}
    </span>
  );
}

const nextText = (p: TemplatePlayer) =>
  p.next.length === 0 ? 'No fixture' : p.next.map((f) => `${f.isHome ? 'v' : '@'} ${f.opponent} (${f.isHome ? 'H' : 'A'})`).join(', ');

const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(1)}`;

function toPitchPlayer(p: TemplatePlayer, gw: number): FplOptimizerPlayer {
  const first = p.next[0];
  return {
    id: p.id,
    name: p.name,
    team: p.teamShort,
    position: p.elementType as FplOptimizerPosition,
    price: p.price,
    total_xpts: p.projHorizon,
    avg_appearance_probability: 0,
    gw_xpts: { [gw]: p.projNext },
    ...(first ? { gw_opponent: { [gw]: { team: first.opponentShort, is_home: first.isHome } } } : {}),
  };
}

function MoveList({ title, rows, deadlineGw }: { title: string; rows: OwnershipMove[]; deadlineGw: number | null }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-ink-900">{title}</h3>
      <ul className="mt-1 space-y-0.5 text-sm text-ink-700">
        {rows.map((m) => (
          <li key={m.id}>
            <PlayerLink p={m} /> <span className="text-ink-500">({m.team})</span>{' '}
            {m.from != null ? `${pct(m.from)} at the gameweek ${deadlineGw} deadline, ${pct(m.to)} now` : `${pct(m.to)} now`}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** initialData: the static build's pre-render; the app itself starts without it and fetches. */
export default function MostOwnedSquadPage({ initialData }: { initialData?: MostOwnedData | null } = {}) {
  const [data, setData] = useState<MostOwnedData | null | undefined>(initialData === undefined ? undefined : initialData);

  useDocumentHead({ title: MOST_OWNED_TITLE, description: MOST_OWNED_DESCRIPTION, path: '/fpl/most-owned' });

  useEffect(() => {
    if (initialData !== undefined) return;
    let cancelled = false;
    getMostOwnedData(todayUk())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [initialData]);

  const byId = useMemo(() => new Map((data?.squad ?? []).map((p) => [p.id, p])), [data]);

  const columns = useMemo<Column<TemplatePlayer>[]>(() => {
    if (!data) return [];
    const gwFrom = data.horizon[0];
    const gwTo = data.horizon[data.horizon.length - 1];
    const cols: Column<TemplatePlayer>[] = [
      {
        key: 'name',
        label: 'Player',
        render: (p) => (
          <span className="text-xs">
            <PlayerLink p={p} />
            {p.id === data.captainId && <span className="ml-1 font-mono text-[10px] text-ink-900">(C)</span>}
            {p.id === data.viceId && <span className="ml-1 font-mono text-[10px] text-ink-500">(V)</span>}
            {!data.xiIds.includes(p.id) && <span className="ml-1 text-[10px] text-ink-500">bench</span>}
          </span>
        ),
        sortValue: (p) => p.name,
      },
      { key: 'pos', label: 'Pos', render: (p) => <span className="font-mono text-xs">{p.position}</span>, sortValue: (p) => p.elementType },
      { key: 'team', label: 'Club', render: (p) => <span className="text-xs text-ink-700">{p.team}</span>, sortValue: (p) => p.team, className: 'hidden sm:table-cell' },
      { key: 'own', label: 'Owned', render: (p) => pct(p.ownership), sortValue: (p) => p.ownership, align: 'right', descFirst: true },
    ];
    if (data.deadlineGw != null) {
      cols.push({
        key: 'change',
        label: `Change since GW${data.deadlineGw} deadline`,
        render: (p) => (p.ownershipAtDeadline == null ? '—' : signed(p.ownership - p.ownershipAtDeadline)),
        sortValue: (p) => (p.ownershipAtDeadline == null ? null : p.ownership - p.ownershipAtDeadline),
        align: 'right',
        descFirst: true,
        className: 'hidden sm:table-cell',
      });
    }
    cols.push(
      { key: 'price', label: 'Price', render: (p) => money(p.price), sortValue: (p) => p.price, align: 'right', descFirst: true },
      { key: 'status', label: 'Status', render: (p) => <StatusCell p={p} />, sortValue: (p) => (p.status === 'a' ? 1 : 0) },
      { key: 'next', label: `GW${data.nextGw}`, render: (p) => <span className="text-xs text-ink-700 whitespace-nowrap">{nextText(p)}</span>, className: 'hidden md:table-cell' },
      { key: 'projNext', label: `Proj GW${data.nextGw}`, render: (p) => p.projNext.toFixed(1), sortValue: (p) => p.projNext, align: 'right', descFirst: true },
      { key: 'projH', label: `Proj GW${gwFrom}–${gwTo}`, render: (p) => p.projHorizon.toFixed(1), sortValue: (p) => p.projHorizon, align: 'right', descFirst: true },
    );
    return cols;
  }, [data]);

  if (data === undefined) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (data === null) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Most-owned squad</h1>
        <p className="text-ink-700 mt-2">Ownership data is not available right now.</p>
      </div>
    );
  }

  const xi = data.xiIds.map((id) => byId.get(id)!).filter(Boolean);
  const bench = data.benchIds.map((id) => byId.get(id)!).filter(Boolean);
  const captain = data.captainId != null ? byId.get(data.captainId) : undefined;
  const vice = data.viceId != null ? byId.get(data.viceId) : undefined;
  const risers = [...data.moves].filter((m) => m.change != null && m.change !== 0).sort((a, b) => (b.change ?? 0) - (a.change ?? 0));

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Most-owned squad</h1>
        <p className="text-ink-900 mt-2 max-w-prose" data-testid="answer-lead">{data.lead}</p>
        <p className="text-xs text-ink-500 font-mono mt-2">
          Ownership from the FPL feed as of <time dateTime={data.asOf}>{formatMatchDateWithYear(data.asOf)}</time>
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" data-testid="most-owned-summary">
        <div className="border border-chalk-300 rounded-lg bg-white p-3">
          <p className="text-xs text-ink-500">Squad cost</p>
          <p className="font-mono text-lg text-ink-900">{money(data.cost)}</p>
          <p className="text-xs text-ink-500">{budgetText(data.cost)}</p>
        </div>
        <div className="border border-chalk-300 rounded-lg bg-white p-3">
          <p className="text-xs text-ink-500">Projected XI, GW{data.nextGw}</p>
          <p className="font-mono text-lg text-ink-900">{data.xiProjNext.toFixed(1)} pts</p>
          <p className="text-xs text-ink-500">{data.formation}, captain&rsquo;s points doubled</p>
        </div>
        <div className="border border-chalk-300 rounded-lg bg-white p-3">
          <p className="text-xs text-ink-500">Captain / vice</p>
          <p className="text-lg text-ink-900">{captain?.name ?? '—'}</p>
          <p className="text-xs text-ink-500">
            {captain ? `${captain.projNext.toFixed(1)} pts projected` : ''}
            {vice ? ` · vice ${vice.name}` : ''}
          </p>
        </div>
      </section>

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Most-owned XI, gameweek {data.nextGw}</h2>
        <div className="mt-2 max-w-xl">
          {xi.length === 11 && captain && (
            <SquadPitch
              starters={xi.map((p) => toPitchPlayer(p, data.nextGw))}
              formation={data.formation}
              matchweek={data.nextGw}
              captainName={captain.name}
              viceCaptainName={vice?.name ?? ''}
            />
          )}
        </div>
        <div className="mt-2 border border-chalk-300 rounded-lg bg-chalk-100 p-3 max-w-xl" data-testid="most-owned-bench">
          <h3 className="font-display uppercase tracking-wide text-xs text-ink-500">Bench</h3>
          <ol className="mt-1 space-y-0.5 text-sm">
            {bench.map((p, i) => (
              <li key={p.id} className="flex gap-2">
                <span className="font-mono text-xs text-ink-500 w-6">{p.elementType === 1 ? 'GK' : i}</span>
                <span>
                  <PlayerLink p={p} /> <span className="text-ink-500 text-xs">{p.position} &middot; {p.team} &middot; {pct(p.ownership)} &middot; {p.projNext.toFixed(1)} pts</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">The 15</h2>
        <div className="mt-2">
          <SortableTable
            columns={columns}
            rows={data.squad}
            rowKey={(p) => String(p.id)}
            caption="The most-owned legal FPL squad"
            testId="most-owned-table"
          />
        </div>
      </section>

      {data.deadlineGw != null && (
        <section data-testid="most-owned-changes">
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Since the gameweek {data.deadlineGw} deadline</h2>
          <div className="mt-2 space-y-3">
            {data.joined.length === 0 && data.dropped.length === 0 && (
              <p className="text-sm text-ink-700">The same 15 players made the most-owned squad at the deadline.</p>
            )}
            <MoveList title="In the template now" rows={data.joined} deadlineGw={data.deadlineGw} />
            <MoveList title="Dropped out" rows={data.dropped} deadlineGw={data.deadlineGw} />
            {risers.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-ink-900">Biggest moves in the 15</h3>
                <ul className="mt-1 space-y-0.5 text-sm text-ink-700">
                  {[...risers.filter((m) => (m.change ?? 0) > 0).slice(0, 3), ...risers.filter((m) => (m.change ?? 0) < 0).slice(-3).reverse()].map((m) => (
                    <li key={m.id}>
                      <PlayerLink p={m} /> {pct(m.from ?? 0)} &rarr; {pct(m.to)}{' '}
                      <span className="font-mono text-xs text-ink-500">({signed(m.change ?? 0)})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      <section data-testid="most-owned-weak-spots">
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">The template&rsquo;s weak spots</h2>
        <ul className="mt-2 space-y-1 text-sm text-ink-700 list-disc pl-5">
          {data.weakSpots.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </section>

      <section className="text-xs text-ink-500 max-w-prose space-y-1">
        <p>
          Squad: players in order of ownership, each added if the squad stays legal (2 GK, 5 DEF, 5 MID, 3 FWD, at most 3
          per club). The budget is not applied; the cost is shown against it.
        </p>
        <p>
          XI and captain: the legal XI with the most projected points for gameweek {data.nextGw} from our projections, captain
          and vice the two highest. These are our picks, not a count of what managers chose.
        </p>
      </section>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fpl/player-points" className="text-pitch-800 underline underline-offset-2">Player projections</Link>
        <Link to="/fpl/optimal-squad" className="text-pitch-800 underline underline-offset-2">Optimal squad</Link>
        <Link to="/fpl/in-the-papers" className="text-pitch-800 underline underline-offset-2">Gameweek news</Link>
        <Link to="/fpl/injuries" className="text-pitch-800 underline underline-offset-2">Physio Room</Link>
      </nav>
    </article>
  );
}

// The league table (rounds 1–9) and Finals Sunday.
import SortableTable, { type Column } from '../../components/SortableTable';
import type { SeasonData, SfSeason, SfTableRow } from '../../lib/sharkFantasyApi';

export default function TableTab({ season, data }: { season: SfSeason; data: SeasonData }) {
  const name = (id: string) => data.clubs.find((c) => c.club_id === id)?.name ?? id;
  const ordered = data.table.slice().sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  const pos = new Map(ordered.map((r, i) => [r.club_id, i + 1]));
  const cols: Column<SfTableRow>[] = [
    { key: 'pos', label: '#', render: (r) => pos.get(r.club_id), sortValue: (r) => pos.get(r.club_id) ?? null },
    { key: 'club', label: 'Club', render: (r) => name(r.club_id), sortValue: (r) => name(r.club_id) },
    { key: 'p', label: 'P', render: (r) => r.p, sortValue: (r) => r.p, align: 'right' },
    { key: 'w', label: 'W', render: (r) => r.w, sortValue: (r) => r.w, align: 'right', descFirst: true },
    { key: 'd', label: 'D', render: (r) => r.d, sortValue: (r) => r.d, align: 'right', descFirst: true },
    { key: 'l', label: 'L', render: (r) => r.l, sortValue: (r) => r.l, align: 'right', descFirst: true },
    { key: 'gf', label: 'GF', render: (r) => r.gf, sortValue: (r) => r.gf, align: 'right', descFirst: true, className: 'hidden sm:table-cell' },
    { key: 'ga', label: 'GA', render: (r) => r.ga, sortValue: (r) => r.ga, align: 'right', descFirst: true, className: 'hidden sm:table-cell' },
    { key: 'gd', label: 'GD', render: (r) => (r.gd > 0 ? `+${r.gd}` : r.gd), sortValue: (r) => r.gd, align: 'right', descFirst: true },
    { key: 'pts', label: 'Pts', render: (r) => <span className="font-semibold">{r.pts}</span>, sortValue: (r) => r.pts, align: 'right', descFirst: true },
  ];
  const finals = data.fixtures.filter((f) => f.round === 10 && f.status === 'full_time');
  return (
    <div className="space-y-5">
      <SortableTable columns={cols} rows={data.table} rowKey={(r) => r.club_id} initialSort={{ key: 'pos', dir: 'asc' }} testId="sf-table" empty="No results yet." />
      {finals.length > 0 && (
        <section className="text-sm space-y-1" aria-label="Finals Sunday" data-testid="sf-finals">
          <h2 className="font-semibold text-ink-900">Finals Sunday</h2>
          {finals.map((f) => (
            <p key={f.fixture_id}><span className="text-ink-500 mr-2">{f.kind === 'final' ? 'Shark Shield Final' : 'Play-off'}</span>
              {name(f.home_id)} <span className="scoreline px-1.5 mx-1">{f.home_goals}–{f.away_goals}{f.shootout ? ` (${f.shootout.home}–${f.shootout.away}p)` : ''}</span> {name(f.away_id)}</p>
          ))}
          {season.shield_winner && <p className="font-semibold">Shark Shield: {name(season.shield_winner)}</p>}
        </section>
      )}
    </div>
  );
}

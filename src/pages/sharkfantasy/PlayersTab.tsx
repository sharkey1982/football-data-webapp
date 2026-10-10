// Players: prices, points, the Shark's projection and the scouting reports.
import { useState } from 'react';
import SortableTable, { type Column } from '../../components/SortableTable';
import type { SeasonData, SfPlayer } from '../../lib/sharkFantasyApi';
import { POS_ORDER, price, xp } from './format';

export default function PlayersTab({ data }: { data: SeasonData }) {
  const [pos, setPos] = useState('');
  const rows = data.players.filter((p) => !pos || p.position === pos);
  const change = (p: SfPlayer) => p.price - p.start_price;
  const cols: Column<SfPlayer>[] = [
    { key: 'name', label: 'Player', render: (p) => p.name, sortValue: (p) => p.name },
    { key: 'pos', label: 'Pos', render: (p) => p.position, sortValue: (p) => POS_ORDER.indexOf(p.position) },
    { key: 'club', label: 'Club', render: (p) => p.club, sortValue: (p) => p.club },
    { key: 'age', label: 'Age', render: (p) => p.age, sortValue: (p) => p.age, align: 'right', className: 'hidden md:table-cell' },
    { key: 'price', label: 'Price', render: (p) => price(p.price), sortValue: (p) => p.price, align: 'right', descFirst: true },
    { key: 'chg', label: '±', render: (p) => (change(p) ? <span className={change(p) > 0 ? 'text-pitch-700' : 'text-loss-700'}>{change(p) > 0 ? '+' : ''}{price(change(p))}</span> : ''), sortValue: change, align: 'right', descFirst: true },
    { key: 'pts', label: 'Points', render: (p) => p.total_points, sortValue: (p) => p.total_points, align: 'right', descFirst: true },
    { key: 'xp', label: 'Next xP', render: (p) => xp(p.next_x_points), sortValue: (p) => p.next_x_points, align: 'right', descFirst: true },
    { key: 'att', label: 'Attack', render: (p) => p.attack, sortValue: (p) => p.attack, align: 'right', descFirst: true, className: 'hidden md:table-cell' },
    { key: 'cre', label: 'Creativity', render: (p) => p.creativity, sortValue: (p) => p.creativity, align: 'right', descFirst: true, className: 'hidden md:table-cell' },
    { key: 'def', label: 'Defence', render: (p) => p.defence, sortValue: (p) => p.defence, align: 'right', descFirst: true, className: 'hidden md:table-cell' },
    { key: 'gk', label: 'Keeping', render: (p) => p.keeping, sortValue: (p) => p.keeping, align: 'right', descFirst: true, className: 'hidden lg:table-cell' },
    { key: 'avail', label: 'Available', render: (p) => (p.available_from > 1 ? `from round ${p.available_from}` : ''), sortValue: (p) => p.available_from, className: 'hidden sm:table-cell' },
  ];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 text-sm">
        {['', ...POS_ORDER].map((x) => (
          <button key={x || 'all'} type="button" onClick={() => setPos(x)} className={`px-2 py-0.5 rounded ${pos === x ? 'bg-pitch-800 text-chalk-100' : 'border border-chalk-300'}`}>{x || 'All'}</button>
        ))}
      </div>
      <SortableTable columns={cols} rows={rows} rowKey={(p) => p.player_id} initialSort={{ key: 'pts', dir: 'desc' }} testId="sf-players" />
      <p className="text-xs text-ink-500">Attack, creativity, defence and keeping are scouting reports (0–99): close to the truth, never exact.</p>
    </div>
  );
}

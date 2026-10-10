// Leaderboard: every entry, people and bots; a team's latest round on click.
import { useState } from 'react';
import SortableTable, { type Column } from '../../components/SortableTable';
import { loadEntryRounds, type SeasonData, type SfEntryRound, type SfLeaderRow, type SfMyTeam } from '../../lib/sharkFantasyApi';
import { BOT_LABEL } from './format';

export default function LeaderboardTab({ data, mine }: { data: SeasonData; mine: SfMyTeam | null }) {
  const [shown, setShown] = useState<{ row: SfLeaderRow; rounds: SfEntryRound[] } | null>(null);
  const ranked = data.leaderboard.slice().sort((a, b) => b.total - a.total);
  const rank = new Map<number, number>();
  ranked.forEach((r, i) => rank.set(r.entry_id, i > 0 && r.total === ranked[i - 1].total ? rank.get(ranked[i - 1].entry_id)! : i + 1));
  const byId = new Map(data.players.map((p) => [p.player_id, p]));
  const open = async (row: SfLeaderRow) => setShown({ row, rounds: await loadEntryRounds(row.entry_id) });

  const cols: Column<SfLeaderRow>[] = [
    { key: 'rank', label: '#', render: (r) => rank.get(r.entry_id), sortValue: (r) => rank.get(r.entry_id) ?? null },
    { key: 'team', label: 'Team', render: (r) => <button type="button" className={`underline-offset-2 hover:underline text-left ${mine?.entry_id === r.entry_id ? 'font-semibold' : ''}`} onClick={() => void open(r)}>{r.team_name}</button>, sortValue: (r) => r.team_name },
    { key: 'manager', label: 'Manager', render: (r) => (r.is_bot ? BOT_LABEL[r.bot_kind ?? ''] ?? 'Bot' : r.display_name), sortValue: (r) => (r.is_bot ? `~${r.bot_kind}` : r.display_name), className: 'hidden sm:table-cell' },
    { key: 'joined', label: 'Joined', render: (r) => `R${r.joined_round}`, sortValue: (r) => r.joined_round, className: 'hidden sm:table-cell' },
    { key: 'last', label: 'Round', render: (r) => r.last_round ?? '–', sortValue: (r) => r.last_round, align: 'right', descFirst: true },
    { key: 'hits', label: 'Hits', render: (r) => (r.hits ? `−${r.hits}` : '0'), sortValue: (r) => r.hits, align: 'right' },
    { key: 'total', label: 'Total', render: (r) => <span className="font-semibold">{r.total}</span>, sortValue: (r) => r.total, align: 'right', descFirst: true },
  ];
  const last = shown?.rounds.filter((x) => x.total != null).slice(-1)[0];
  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2"><SortableTable columns={cols} rows={data.leaderboard} rowKey={(r) => String(r.entry_id)} initialSort={{ key: 'total', dir: 'desc' }} testId="sf-leaderboard" empty="No teams yet." /></div>
      {shown && (
        <aside className="text-sm space-y-2" data-testid="sf-entry">
          <h2 className="font-semibold text-ink-900">{shown.row.team_name}</h2>
          {last ? <>
            <p className="text-ink-500">Round {last.round}: {last.total} points</p>
            <ol>{last.picks.slice().sort((a, b) => a.slot - b.slot).map((p) => (
              <li key={p.player_id} className={p.slot > 11 ? 'text-ink-500' : ''}>{byId.get(p.player_id)?.name ?? p.player_id} <span className="text-ink-500">{byId.get(p.player_id)?.club}</span>{p.is_captain ? ' (C)' : p.is_vice ? ' (V)' : ''}</li>
            ))}</ol>
          </> : <p className="text-ink-500">No round scored yet.</p>}
        </aside>
      )}
    </div>
  );
}

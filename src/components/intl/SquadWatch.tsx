// ============================================================================
// src/components/intl/SquadWatch.tsx
//
// Squad watch (Chris, 6 Oct 2026: the FPL Minutes Outlook idea for national
// teams). There are no free international line-ups or minutes, so this shows
// selection over time from the saved squad versions (intl_squad_versions):
//   * Gaining / losing a place since the previous squad, missing out (injured,
//     withdrew) and uncapped players;
//   * played this window: caps gained while the squad stood -- appearances,
//     not starts or minutes;
//   * a grid: one row per player, one column per squad announcement, each
//     cell in / played n / left (why) / out (why).
// History starts on 6 Oct 2026 and grows with each international window.
// ============================================================================

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { shortDate, squadWatch, statusText, type SnapshotPlayer, type SquadVersion, type WatchCell, type WatchRow } from '../../lib/intlStats';

const wikiUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

function Name({ r }: { r: WatchRow }) {
  return r.wiki_title ? <a href={wikiUrl(r.wiki_title)} target="_blank" rel="noopener noreferrer" className="hover:underline">{r.player}</a> : <>{r.player}</>;
}

function List({ title, rows, note, tone, testId }: { title: string; rows: WatchRow[]; note?: (r: WatchRow) => string | null; tone: 'up' | 'down' | 'plain'; testId?: string }) {
  if (!rows.length) return null;
  const border = tone === 'up' ? 'border-pitch-600' : tone === 'down' ? 'border-loss-600' : 'border-chalk-300';
  return (
    <div className={`rounded-lg border-l-4 ${border} border border-chalk-300 bg-white p-3`} data-testid={testId}>
      <p className="text-sm font-medium text-ink-900">{`${title} (${rows.length})`}</p>
      <ul className="mt-1 text-sm text-ink-700 space-y-0.5">
        {rows.slice(0, 12).map((r) => (
          <li key={r.key}>
            <Name r={r} />
            {note?.(r) && <span className="ml-1 text-xs text-ink-500">{note(r)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Cell({ c }: { c: WatchCell }) {
  if (!c) return <td className="px-1 py-1 text-center text-ink-500 text-xs">&middot;</td>;
  if (c.kind === 'in') {
    const played = c.played ?? null;
    return (
      <td className="px-1 py-1 text-center">
        <span
          className={`inline-block min-w-[2.25rem] rounded px-1 py-0.5 text-[11px] font-mono ${played ? 'bg-pitch-700 text-chalk-100' : 'bg-pitch-600/20 text-pitch-800'}`}
          title={played == null ? 'In the squad' : played ? `In the squad; played ${played} game${played === 1 ? '' : 's'}` : 'In the squad; not used so far'}
        >
          {played ? `+${played}` : 'in'}
        </span>
      </td>
    );
  }
  const label = statusText(c.status) ?? (c.kind === 'left' ? 'left' : 'out');
  return (
    <td className="px-1 py-1 text-center">
      <span className={`inline-block rounded px-1 py-0.5 text-[10px] uppercase tracking-wide ${c.kind === 'left' ? 'bg-loss-600/15 text-loss-700' : 'bg-chalk-200 text-ink-700'}`} title={c.kind === 'left' ? `Left the squad: ${label}` : `Not in this squad: ${label}`}>
        {label}
      </span>
    </td>
  );
}

export default function SquadWatch({ versions, players }: { versions: SquadVersion[]; players: SnapshotPlayer[] }) {
  const w = useMemo(() => squadWatch(versions, players), [versions, players]);
  const [all, setAll] = useState(false);
  if (!w.squads.length) return null;
  const shownRows = all ? w.rows : w.rows.filter((r) => r.inLatest || r.cells.some((c) => c && c.kind !== 'out'));
  const cols = w.squads.slice(-8);
  const offset = w.squads.length - cols.length;
  const oneSquad = w.squads.length === 1;
  const latest = w.squads[w.squads.length - 1];
  return (
    <div className="space-y-3" data-testid="intl-squad-watch">
      <p className="text-sm text-ink-700 max-w-prose">
        {`Who’s in each squad, who drops out and why, and who played: caps going up while a squad stands. Appearances, not minutes — there’s no free source of international line-ups. Tracked since ${shortDate(w.squads[0].from)}.`}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <List title="Gaining a place" rows={w.gaining} tone="up" note={(r) => (r.caps === 0 ? 'uncapped' : null)} testId="intl-watch-gaining" />
        <List title="Losing a place" rows={w.losing} tone="down" note={(r) => { const c = r.cells[r.cells.length - 1]; return c && c.kind !== 'in' ? statusText(c.status) : null; }} testId="intl-watch-losing" />
        <List title="Missing out this window" rows={w.missing} tone="down" note={(r) => { const c = r.cells[r.cells.length - 1]; return c && c.kind !== 'in' ? statusText(c.status) : null; }} testId="intl-watch-missing" />
        <List title="Played this window" rows={w.played} tone="up" note={(r) => { const c = r.cells[r.cells.length - 1]; return c?.kind === 'in' && c.played ? `+${c.played} cap${c.played === 1 ? '' : 's'}` : null; }} testId="intl-watch-played" />
        <List title="In the squad, not used yet" rows={w.unused} tone="plain" />
        <List title="Uncapped in this squad" rows={w.uncapped} tone="plain" note={(r) => (r.club ? r.club : null)} />
      </div>
      {oneSquad && (
        <p className="text-xs text-ink-500">{`One squad saved so far (named by ${shortDate(latest.from)}). Caps gained show from the next update after a game; “gaining” and “losing a place” start with the next squad announcement.`}</p>
      )}
      <div className="overflow-x-auto">
        <table className="text-sm border border-chalk-300 rounded-lg bg-white min-w-full" data-testid="intl-watch-grid">
          <thead className="bg-chalk-200 text-ink-500 text-xs">
            <tr>
              <th className="text-left font-medium px-2 py-1 sticky left-0 bg-chalk-200">Player</th>
              {cols.map((s) => (
                <th key={s.from} className="px-1 py-1 font-medium text-center whitespace-nowrap" title={s.intro ?? ''}>
                  {s.from === s.to ? shortDate(s.from).replace(/ \d{4}$/, '') : `${shortDate(s.from).replace(/ \d{4}$/, '')}–${shortDate(s.to).replace(/ \d{4}$/, '')}`}
                </th>
              ))}
              <th className="px-2 py-1 font-medium text-right">Caps</th>
            </tr>
          </thead>
          <tbody>
            {shownRows.map((r) => (
              <tr key={r.key} className={`border-t border-chalk-200 ${r.inLatest ? '' : 'text-ink-500'}`}>
                <td className="px-2 py-1 whitespace-nowrap sticky left-0 bg-white">
                  <span className="text-[10px] font-mono text-ink-500 mr-1.5">{r.position ?? ''}</span>
                  <Name r={r} />
                  {r.club && <span className="ml-1.5 text-[11px] text-ink-500 hidden sm:inline">{r.club_slug ? <Link to={`/football/teams/${r.club_slug}`} className="hover:underline">{r.club}</Link> : r.club}</span>}
                </td>
                {cols.map((_, i) => <Cell key={i} c={r.cells[offset + i]} />)}
                <td className="px-2 py-1 text-right font-mono text-xs tabular-nums">{r.caps ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
        <span><span className="inline-block rounded bg-pitch-700 px-1 font-mono text-chalk-100">+2</span> played twice</span>
        <span><span className="inline-block rounded bg-pitch-600/20 px-1 font-mono text-pitch-800">in</span> in the squad</span>
        <span><span className="inline-block rounded bg-loss-600/15 px-1 uppercase text-loss-700">injured</span> left the squad, with the reason</span>
        <span><span className="inline-block rounded bg-chalk-200 px-1 uppercase text-ink-700">withdrew</span> not in this squad, with the reason</span>
        <button type="button" onClick={() => setAll((v) => !v)} className="underline text-pitch-800">{all ? 'Hide older call-ups' : 'Show every recent call-up'}</button>
      </div>
    </div>
  );
}

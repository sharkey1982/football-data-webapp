// ============================================================================
// src/components/EmailWatchlist.tsx
//
// The FPL weekly email's player watchlist on /email/manage: search this
// season's players by name, add up to MAX_WATCHLIST, remove. Only the FPL
// player ids are saved (private.email_subscribers.watchlist); the email then
// reports each one's price, status, start chance, fixtures and form.
// ============================================================================

import { useEffect, useId, useState } from 'react';
import { MAX_WATCHLIST, searchPlayers, type WatchPlayer } from '../lib/emailApi';

export default function EmailWatchlist({ players, onChange, disabled }: {
  players: WatchPlayer[];
  onChange: (next: WatchPlayer[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<WatchPlayer[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let live = true;
    const t = window.setTimeout(() => {
      searchPlayers(term)
        .then((r) => { if (live) { setHits(r); setFailed(false); } })
        .catch(() => { if (live) setFailed(true); });
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [q]);

  const full = players.length >= MAX_WATCHLIST;
  const desc = (p: WatchPlayer) => `${p.team ?? ''} ${p.pos ?? ''} £${p.price.toFixed(1)}m`.trim();

  return (
    <div className="space-y-2" data-testid="email-watchlist">
      {players.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Your watchlist">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-1 rounded border border-chalk-300 bg-chalk-100 pl-2 text-sm">
              <span><span className="font-medium">{p.name}</span> <span className="text-ink-500">{desc(p)}</span></span>
              <button type="button" disabled={disabled} onClick={() => onChange(players.filter((x) => x.id !== p.id))}
                aria-label={`Remove ${p.name}`} className="px-2 py-1 text-ink-500 hover:text-ink-900">&times;</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-700">No players yet.</p>
      )}
      <label htmlFor={`${id}-q`} className="block text-sm text-ink-700">Add a player</label>
      <input id={`${id}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} disabled={disabled || full}
        placeholder={full ? `Up to ${MAX_WATCHLIST} players` : 'Type a name'} autoComplete="off"
        className="w-full rounded border border-chalk-300 bg-white px-3 py-2 text-ink-900" />
      {failed && <p role="alert" className="text-sm text-loss-700">The search didn&rsquo;t work. Try again in a minute.</p>}
      {q.trim().length >= 2 && hits.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`Players matching ${q}`}>
          {hits.filter((h) => !players.some((p) => p.id === h.id)).map((h) => (
            <li key={h.id}>
              <button type="button" disabled={disabled || full}
                onClick={() => { onChange([...players, h]); setQ(''); setHits([]); }}
                className="rounded border border-chalk-300 bg-white px-3 py-1.5 text-sm hover:border-amber-500">
                <span className="font-medium">{h.name}</span> <span className="text-ink-500">{desc(h)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

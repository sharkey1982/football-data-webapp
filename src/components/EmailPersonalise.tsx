// ============================================================================
// src/components/EmailPersonalise.tsx
//
// The optional "Your team" fields for the FPL weekly email: an FPL team ID and
// a club. Used by the sign-up form (prefilled from My FixtureShark, which is
// kept in this browser only) and the manage page. Plain named inputs
// (fpl_id, club_id), so they post with the static HTML form too. The club
// list loads when the fields are first shown.
// ============================================================================

import { useEffect, useId, useState } from 'react';

type ClubOption = { teamId: number; name: string; league: string };

let clubCache: Promise<ClubOption[]> | null = null;
function loadClubs(): Promise<ClubOption[]> {
  clubCache ??= import('../lib/myHomeApi')
    .then((m) => m.getMyClubOptions())
    .then((list) => list.map((c) => ({ teamId: c.teamId, name: c.name, league: c.league })))
    .catch(() => {
      clubCache = null;
      return [];
    });
  return clubCache;
}

export default function EmailPersonalise({ fplId, clubId, clubName, onFplId, onClub, active }: {
  fplId: string;
  clubId: number | null;
  /** Shown before the list loads (from the browser preferences or the saved choice). */
  clubName?: string | null;
  onFplId: (v: string) => void;
  onClub: (id: number | null) => void;
  /** Load the club list (the fields are visible). */
  active: boolean;
}) {
  const id = useId();
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  useEffect(() => {
    if (!active) return;
    let live = true;
    loadClubs().then((l) => { if (live) setClubs(l); });
    return () => { live = false; };
  }, [active]);
  const known = clubId != null && !clubs.some((c) => c.teamId === clubId);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div>
        <label htmlFor={`${id}-fpl`} className="block text-sm text-ink-700">FPL team ID</label>
        <input
          id={`${id}-fpl`}
          name="fpl_id"
          inputMode="numeric"
          pattern="\d{1,8}"
          autoComplete="off"
          placeholder="e.g. 1234567"
          value={fplId}
          onChange={(e) => onFplId(e.target.value.replace(/\D/g, '').slice(0, 8))}
          className="w-full rounded border border-chalk-300 bg-white px-3 py-2 text-ink-900"
        />
      </div>
      <div>
        <label htmlFor={`${id}-club`} className="block text-sm text-ink-700">Your club</label>
        <select
          id={`${id}-club`}
          name="club_id"
          value={clubId == null ? '' : String(clubId)}
          onChange={(e) => onClub(e.target.value ? Number(e.target.value) : null)}
          className="w-full rounded border border-chalk-300 bg-white px-3 py-2 text-ink-900"
        >
          <option value="">None</option>
          {known && <option value={String(clubId)}>{clubName ?? 'Your club'}</option>}
          {clubs.map((c) => (
            <option key={c.teamId} value={String(c.teamId)}>{c.name}{c.league ? ` (${c.league})` : ''}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

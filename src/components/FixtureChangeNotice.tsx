// ============================================================================
// src/components/FixtureChangeNotice.tsx
//
// One line, not a banner: "2 Premier League fixtures have moved this week.
// See the changes". The detail lives on /fixtures/changes. Dismissing it
// stores the newest change's time in this browser, so it stays hidden until
// a newer change appears. Counts are net of the feed's flip-flops
// (fixture_changes_net), so a fixture moved and moved back never shows.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFixtureChanges, type FixtureChange } from '../lib/api';

const SEEN_KEY = 'fs-fixture-changes-seen';
const WINDOW_DAYS = 7;

function readSeen(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function FixtureChangeNotice({ leagueCode = 'E0' }: { leagueCode?: string }) {
  const [changes, setChanges] = useState<FixtureChange[] | null>(null);
  const [seen, setSeen] = useState<string | null>(readSeen);

  useEffect(() => {
    let live = true;
    getFixtureChanges(leagueCode)
      .then((c) => {
        const since = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
        if (live) setChanges(c.filter((x) => new Date(x.changed_at).getTime() > since && x.status !== 'played'));
      })
      .catch(() => {
        if (live) setChanges([]);
      });
    return () => {
      live = false;
    };
  }, [leagueCode]);

  const recent = changes ?? [];
  const newest = recent[0]?.changed_at ?? null;
  if (!newest || (seen && seen >= newest)) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, newest);
    } catch {
      // Private browsing: hidden for this visit only.
    }
    setSeen(newest);
  };
  const league = recent[0].league_name;
  const n = recent.length;

  return (
    <p className="flex items-center gap-2 text-sm text-ink-700 border-l-2 border-amber-500 pl-3 py-0.5" data-testid="fixture-change-notice">
      <span>
        {`${n} ${league} ${n === 1 ? 'fixture has' : 'fixtures have'} moved in the last week. `}
        <Link to={`/fixtures/changes?league=${leagueCode}`} className="text-pitch-800 underline underline-offset-2">
          See the changes
        </Link>
      </span>
      <button type="button" onClick={dismiss} aria-label="Hide until the next change" className="text-ink-500 hover:text-ink-900 ml-auto">
        &times;
      </button>
    </p>
  );
}

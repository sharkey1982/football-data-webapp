// ============================================================================
// src/lib/myPrefs.ts
//
// "My FixtureShark" preferences (Chris, 25 Oct 2026): the visitor's club,
// up to three followed clubs, FPL ID, international team, NFL team and tennis
// players, kept in this browser (localStorage) -- no account. The FPL ID keeps
// its own key (src/lib/fplIdStore.ts), shared with Rate My Team and FPL Live.
// Storage can be blocked (private windows, strict settings): every call fails
// quietly and the site behaves as for a first visit.
// ============================================================================

import { forgetFplId, readStoredFplId, storeFplId } from './fplIdStore';

const PREFS_KEY = 'fixtureshark.myPrefs';
const STRIP_KEY = 'fixtureshark.myStripDismissed';
export const MAX_FOLLOWED = 3;
export const MAX_TENNIS_PLAYERS = 5;

export type MyClub = { teamId: number; name: string; slug: string; league?: string };
export type MyIntlTeam = { slug: string; name: string };
export type MyNflTeam = { slug: string; name: string };
export type MyTennisPlayer = { tour: 'ATP' | 'WTA'; slug: string; name: string };
export type MyTennis =
  | { mode: 'country'; country: string; label: string }
  | { mode: 'players'; players: MyTennisPlayer[] };

export type MyPrefs = {
  club: MyClub | null;
  followed: MyClub[];
  fplId: string;
  intl: MyIntlTeam | null;
  nfl: MyNflTeam | null;
  tennis: MyTennis | null;
  /** Open on the personal page (default on once a club is set). */
  openMyPage: boolean;
};

export const EMPTY_PREFS: MyPrefs = { club: null, followed: [], fplId: '', intl: null, nfl: null, tennis: null, openMyPage: true };

function isClub(v: unknown): v is MyClub {
  const c = v as MyClub;
  return !!c && typeof c.teamId === 'number' && typeof c.name === 'string' && typeof c.slug === 'string';
}
function isNamed(v: unknown): v is { slug: string; name: string } {
  const c = v as { slug: string; name: string };
  return !!c && typeof c.slug === 'string' && typeof c.name === 'string';
}

/** Parse what was stored, dropping anything malformed (a hand-edited or older value). */
export function parsePrefs(raw: string | null, fplId = ''): MyPrefs {
  let v: Record<string, unknown>;
  try {
    v = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    v = {};
  }
  const club = isClub(v.club) ? v.club : null;
  const followed = Array.isArray(v.followed)
    ? (v.followed.filter(isClub) as MyClub[]).filter((c) => c.teamId !== club?.teamId).slice(0, MAX_FOLLOWED)
    : [];
  let tennis: MyTennis | null = null;
  const t = v.tennis as MyTennis | null | undefined;
  if (t && t.mode === 'country' && typeof t.country === 'string' && /^[A-Z]{2}$/.test(t.country)) {
    tennis = { mode: 'country', country: t.country, label: typeof t.label === 'string' ? t.label : t.country };
  } else if (t && t.mode === 'players' && Array.isArray(t.players)) {
    const players = t.players.filter((p) => isNamed(p) && (p.tour === 'ATP' || p.tour === 'WTA')).slice(0, MAX_TENNIS_PLAYERS);
    if (players.length) tennis = { mode: 'players', players };
  }
  return {
    club,
    followed,
    fplId,
    intl: isNamed(v.intl) ? v.intl : null,
    nfl: isNamed(v.nfl) ? v.nfl : null,
    tennis,
    openMyPage: v.openMyPage !== false,
  };
}

export function readPrefs(): MyPrefs {
  let raw: string | null;
  try {
    raw = localStorage.getItem(PREFS_KEY);
  } catch {
    raw = null;
  }
  return parsePrefs(raw, readStoredFplId());
}

export function savePrefs(p: MyPrefs): void {
  const { fplId, ...rest } = p;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(rest));
  } catch {
    /* storage unavailable */
  }
  if (/^\d{1,9}$/.test(fplId.trim())) storeFplId(fplId.trim());
  else forgetFplId();
}

export function clearPrefs(): void {
  try {
    localStorage.removeItem(PREFS_KEY);
  } catch {
    /* nothing to clear */
  }
  forgetFplId();
}

/** Anything chosen at all (an FPL ID alone counts). */
export function hasAnyPrefs(p: MyPrefs): boolean {
  return !!(p.club || p.followed.length || p.fplId || p.intl || p.nfl || p.tennis);
}

/** The home page opens on the personal page: a club is set and the switch is on. */
export function opensMyPage(p: MyPrefs): boolean {
  return !!p.club && p.openMyPage;
}

export function stripDismissed(): boolean {
  try {
    return localStorage.getItem(STRIP_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissStrip(): void {
  try {
    localStorage.setItem(STRIP_KEY, '1');
  } catch {
    /* storage unavailable: it shows again next visit */
  }
}

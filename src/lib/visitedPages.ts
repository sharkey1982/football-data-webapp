// ============================================================================
// src/lib/visitedPages.ts
//
// Which pages have been opened DURING THIS VISIT -- so the trivia carousel,
// now a subtle navigation tool, can lead with questions about places a
// visitor hasn't been yet.
//
// IN MEMORY ONLY, deliberately. Writing it to localStorage would be storing
// information on the visitor's device, which under UK PECR needs consent
// unless strictly necessary -- and the site's banner asks consent for
// ANALYTICS only, which cannot be borrowed for a different purpose. Memory
// needs no consent: it survives navigation within the site (a single-page
// app) and starts fresh on the next visit, where random order does the rest.
// Persisting across visits would need its own clearly worded opt-in.
//
// Pages are compared by their first two path segments, so a visit to any
// match page counts for "/football/matches", and the Gameweek 5 Team of the
// Week counts for "/fpl/team-of-the-week".
// ============================================================================

const visited = new Set<string>();

export function pageKey(path: string): string {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return '/' + clean.split('/').filter(Boolean).slice(0, 2).join('/');
}

export function getVisitedPages(): Set<string> {
  return new Set(visited);
}

export function recordVisit(path: string): void {
  visited.add(pageKey(path));
}

/** For tests only. */
export function _resetVisitedPages(): void {
  visited.clear();
}

/** Unvisited first, each group in random order. Returns a new array. */
export function orderForDiscovery<T extends { link: { to: string } }>(items: T[], visited: Set<string>, random: () => number = Math.random): T[] {
  const shuffle = (a: T[]) => {
    const out = a.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const fresh = items.filter((f) => !visited.has(pageKey(f.link.to)));
  const seen = items.filter((f) => visited.has(pageKey(f.link.to)));
  return [...shuffle(fresh), ...shuffle(seen)];
}

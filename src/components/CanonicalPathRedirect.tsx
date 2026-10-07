// ============================================================================
// src/components/CanonicalPathRedirect.tsx
//
// Sends a trailing-slash or upper-case address to its canonical form
// (/football/teams/caen/ -> /football/teams/caen) with a replace navigation.
//
// Why here and not in netlify.toml: Netlify already 301s these variants for
// every GENERATED page, but the client-rendered pages (non-Premier League
// clubs, older NFL games, most tennis editions and pairs, international
// matches: ~13,000 URLs) are answered by the app-shell fallback, which says
// 200 to any spelling. Netlify redirect rules can't lower-case a path, and a
// blanket "/*/ -> /:splat" rule loops (see the Beat the Shark note in
// netlify.toml). Googlebot renders these pages and treats this as a redirect,
// and every page's canonical already names the clean form.
// (7 Oct 2026 SEO audit; see docs/seo-indexation.md.)
// ============================================================================
import { Navigate, useLocation } from 'react-router-dom';

/** The canonical spelling of a path, or null when it already is one. */
export function canonicalPathname(pathname: string): string | null {
  if (pathname === '/') return null;
  // The proxied game keeps its slash (netlify.toml); never touch it.
  if (pathname.startsWith('/play/')) return null;
  let clean = pathname.toLowerCase();
  while (clean.length > 1 && clean.endsWith('/')) clean = clean.slice(0, -1);
  return clean === pathname ? null : clean;
}

export default function CanonicalPathRedirect({ children }: { children: React.ReactNode }) {
  const { pathname, search, hash } = useLocation();
  const target = canonicalPathname(pathname);
  if (target) return <Navigate to={`${target}${search}${hash}`} replace />;
  return <>{children}</>;
}

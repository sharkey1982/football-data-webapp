// ============================================================================
// src/components/EntityLinks.tsx
//
// One way to link a team, a match or an FPL player to its own page, used by
// every list and table that names one. The entity pages are the backbone of
// the site (layout review, 21 Oct 2026): every row that names a team, match
// or player should open it.
//
// Each renders plain text when there is no slug, so a missing slug never
// produces a broken link.
// ============================================================================

import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { trackEvent } from '../lib/analytics';

export const teamPath = (slug: string) => `/football/teams/${slug}`;
export const matchPath = (slug: string) => `/football/matches/${slug}`;
export const fplPlayerPath = (slug: string) => `/fpl/players/${slug}`;

const DEFAULT_CLASS = 'hover:text-pitch-700 hover:underline underline-offset-2';

type Props = {
  slug: string | null | undefined;
  children: ReactNode;
  className?: string;
  /** Where the link sits, for the internal-link analytics event. */
  from?: string;
};

function EntityLink({ to, kind, children, className, from }: { to: string; kind: string; children: ReactNode; className?: string; from?: string }) {
  return (
    <Link
      to={to}
      className={className ?? DEFAULT_CLASS}
      // Rows on some pages are clickable themselves; the link wins.
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        trackEvent('entity_link', { kind, from: from ?? '', to });
      }}
    >
      {children}
    </Link>
  );
}

export function TeamLink({ slug, children, className, from }: Props) {
  if (!slug) return <>{children}</>;
  return <EntityLink to={teamPath(slug)} kind="team" className={className} from={from}>{children}</EntityLink>;
}

export function MatchLink({ slug, children, className, from }: Props) {
  if (!slug) return <>{children}</>;
  return <EntityLink to={matchPath(slug)} kind="match" className={className} from={from}>{children}</EntityLink>;
}

export function PlayerLink({ slug, children, className, from }: Props) {
  if (!slug) return <>{children}</>;
  return <EntityLink to={fplPlayerPath(slug)} kind="player" className={className} from={from}>{children}</EntityLink>;
}

// ============================================================================
// src/components/StaticLinkDirectory.tsx
//
// A plain list of links, server-rendered into the static file of a page
// whose real body is a client-side tool (/fixtures, /fpl/player-points).
// Crawlers that don't run JavaScript get <a href> links to every match or
// player page the tool lists (29 Oct 2026, docs/seo-indexation.md). The app
// replaces it with the tool when it starts (createRoot, not hydration), so
// visitors only see it before the script loads.
// ============================================================================

import { Link } from 'react-router-dom';

export type LinkDirectory = {
  intro: string;
  groups: { heading: string; links: { to: string; label: string; note?: string }[] }[];
};

export default function StaticLinkDirectory({ title, directory }: { title: string; directory: LinkDirectory }) {
  return (
    <article className="space-y-6">
      <header>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">{title}</h1>
        <p className="text-ink-700 mt-1">{directory.intro}</p>
      </header>
      {directory.groups.map((g) => (
        <section key={g.heading}>
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">{g.heading}</h2>
          <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 text-sm">
            {g.links.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="text-pitch-800 underline underline-offset-2">{l.label}</Link>
                {l.note && <span className="text-ink-500 text-xs"> &middot; {l.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}

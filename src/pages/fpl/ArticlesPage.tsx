// ============================================================================
// src/pages/fpl/ArticlesPage.tsx
//
// /fpl/articles -- the FPL articles hub: one card per article, each with
// the question it answers and the short answer. Static; server-rendered.
// ============================================================================

import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { ARTICLES, ARTICLES_PATH } from '../../lib/fplArticles';

export default function ArticlesPage() {
  useDocumentHead({
    title: 'FPL articles: captaincy and strategy questions answered with data',
    description: 'Common Fantasy Premier League questions, answered from four seasons of FPL points and betting-market prices.',
    path: ARTICLES_PATH,
  });
  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/fpl/start" className="hover:underline">FPL</Link> &middot; <Link to="/fpl/start/discover" className="hover:underline">Discover</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Articles</h1>
        <p className="text-ink-700 mt-2 max-w-prose">Questions FPL managers keep asking, answered from the data.</p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {ARTICLES.map((a) => (
          <li key={a.slug}>
            <Link to={a.path} className="block h-full rounded-lg border border-chalk-300 bg-white p-4 hover:border-pitch-700">
              <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">{a.title}</h2>
              <p className="text-sm text-ink-700 mt-2">{a.verdict}</p>
              <p className="text-xs text-pitch-800 mt-3 underline underline-offset-2">Read the analysis</p>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}

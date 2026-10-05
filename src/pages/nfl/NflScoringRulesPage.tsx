// ============================================================================
// src/pages/nfl/NflScoringRulesPage.tsx
//
// /nfl/scoring-rules -- "Scoring Rules", as in Fantasy: exactly how the
// fantasy points on these pages are earned. These are the scoring rules in
// nfl.points_std (supabase/migrations/20261004150000_nfl_players.sql), which
// reproduce nflverse's own standard and PPR points exactly (checked daily).
// Static content, server-rendered.
// ============================================================================

import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { NFL_HUB_PATH, NFL_PLAYERS_PATH, NFL_SCORING_PATH } from '../../lib/nflApi';
import { KICKING_ROWS, SCORING_ROWS } from '../../lib/nflFantasyApi';

export default function NflScoringRulesPage() {
  useDocumentHead({
    title: 'NFL fantasy scoring rules: standard, half-PPR and PPR',
    description: 'How NFL fantasy points are scored on FixtureShark: standard, half-PPR and PPR for passing, rushing, receiving and turnovers, and the kicker rules.',
    path: NFL_SCORING_PATH,
  });
  const th = 'text-right font-medium text-xs px-3 py-2';
  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to="/nfl/discover" className="hover:underline">Discover</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Scoring Rules</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Three common scoring formats. They differ only in what a catch is worth: nothing in standard, half a point in half-PPR, a point in PPR (&ldquo;points per reception&rdquo;). Your league may differ; most leagues use one of these three.
        </p>
      </header>

      <section aria-labelledby="offence-heading">
        <h2 id="offence-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">Players</h2>
        <div className="overflow-x-auto mt-2">
          <table className="text-sm border border-chalk-300 rounded-lg overflow-hidden">
            <thead className="bg-chalk-200 text-ink-500">
              <tr>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">For each</th>
                <th scope="col" className={th}>Standard</th>
                <th scope="col" className={th}>Half-PPR</th>
                <th scope="col" className={th}>PPR</th>
              </tr>
            </thead>
            <tbody>
              {SCORING_ROWS.map(([label, ...vals], i) => (
                <tr key={label} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                  <th scope="row" className="text-left px-3 py-1.5 font-normal">{label}</th>
                  {vals.map((v, j) => <td key={j} className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="kick-heading">
        <h2 id="kick-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">Kickers (all formats)</h2>
        <div className="overflow-x-auto mt-2">
          <table className="text-sm border border-chalk-300 rounded-lg overflow-hidden">
            <tbody>
              {KICKING_ROWS.map(([label, v], i) => (
                <tr key={label} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                  <th scope="row" className="text-left px-3 py-1.5 font-normal">{label}</th>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="text-sm text-ink-700 max-w-prose space-y-2">
        <p>
          Points for players are checked every day against nflverse&rsquo;s own standard and PPR scoring and match exactly. Kicking points use the common ESPN-style rules above; a non-kicker who kicks (an emergency kicker) scores them too.
        </p>
        <p>Team defences are not scored yet.</p>
        <p>
          <Link to={NFL_PLAYERS_PATH} className="text-pitch-800 underline underline-offset-2">See every player&rsquo;s points in Player Scout</Link>.
        </p>
      </section>
    </article>
  );
}

// ============================================================================
// src/pages/nfl/NflProjectionsPage.tsx
//
// /nfl/player-projections -- "Player Projections", as in FPL: projected fantasy
// points for every relevant player in each team's next game, with a typical
// range, the season average, the market's points for his team and the
// matchup. ?team=&pos=&fmt= keep the view shareable, as on Player Scout.
// Method per position from Model Lab experiment NP1 (see nflProjections.ts).
// Client-rendered (head tags at build).
// ============================================================================

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { NFL_HUB_PATH, NFL_MATCH_PROJECTIONS_PATH, NFL_PLAYERS_PATH, NFL_PROJECTIONS_PATH, NFL_SCORING_PATH, ukKickoff } from '../../lib/nflApi';
import { FANTASY_POSITIONS, FORMATS, fantasyPosition, fmt1, type ScoringFormat } from '../../lib/nflFantasyApi';
import { NP1_RESULT, isUnlikely, loadProjections, projOf, projectionSentence } from '../../lib/nflProjections';
import NflProjectionTable from '../../components/nfl/NflProjectionTable';

const PAGE = 100;

export default function NflProjectionsPage() {
  const [params, setParams] = useSearchParams();
  const posParam = params.get('pos')?.toUpperCase() ?? 'ALL';
  const pos = (FANTASY_POSITIONS as readonly string[]).includes(posParam) ? posParam : 'ALL';
  const fmtParam = params.get('fmt') as ScoringFormat | null;
  const fmt: ScoringFormat = fmtParam && FORMATS.some((f) => f.key === fmtParam) ? fmtParam : 'ppr';
  const teamParam = params.get('team');
  const [query, setQuery] = useState('');
  const [showOut, setShowOut] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const { data, failed, loading } = useKeyedFetch('nfl-projections', loadProjections);
  const fmtLabel = FORMATS.find((f) => f.key === fmt)!.label;

  useDocumentHead({
    title: 'NFL Player Projections: projected fantasy points this week',
    description: 'Projected fantasy points for every NFL quarterback, running back, receiver, tight end and kicker in their next game, in PPR, half-PPR and standard scoring, with the range, matchup and injury status.',
    path: NFL_PROJECTIONS_PATH,
  });

  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v == null) p.delete(k);
    else p.set(k, v);
    setParams(p, { replace: true });
    setShown(PAGE);
  };

  const teams = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data ?? []) m.set(r.team_slug, r.team_name);
    return [...m].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);
  const team = teams.find((t) => t.slug === teamParam) ?? null;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? [])
      .filter((r) => (pos === 'ALL' || fantasyPosition(r.position) === pos) && (!team || r.team_slug === team.slug) && (!q || r.player_name.toLowerCase().includes(q)) && (showOut || !isUnlikely(r)))
      .sort((a, b) => projOf(b, fmt) - projOf(a, fmt));
  }, [data, pos, team, query, showOut, fmt]);

  const weeks = useMemo(() => [...new Set((data ?? []).map((r) => r.week))].sort((a, b) => a - b), [data]);
  const hidden = (data ?? []).filter((r) => isUnlikely(r)).length;
  const firstKick = (data ?? []).map((r) => r.kickoff_at).filter(Boolean).sort()[0] ?? null;
  const updated = (data ?? []).map((r) => r.computed_at).sort().at(-1) ?? null;

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to="/nfl/predict" className="hover:underline">Predict</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Player Projections</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Projected fantasy points for each player&rsquo;s next game: his recent scoring, how many points the betting market expects his team to score, and how much the opponent gives up to his position.
          Every projection assumes he plays; injury reports appear from Wednesday.{' '}
          <Link to={NFL_SCORING_PATH} className="text-pitch-800 underline underline-offset-2">How points are scored</Link>. Game by game, side by side: <Link to={NFL_MATCH_PROJECTIONS_PATH} className="text-pitch-800 underline underline-offset-2">Match Projections</Link>.
        </p>
      </header>

      {failed && <p className="text-ink-700">Projections are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && data.length === 0 && <p className="text-ink-700" data-testid="nfl-proj-empty">No projections yet: they appear once the next week&rsquo;s games have betting lines, usually by Tuesday.</p>}

      {data && data.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-500">Club</span>
              <select className="border border-chalk-300 rounded px-2 py-1 bg-white" value={team?.slug ?? ''} onChange={(e) => set('team', e.target.value || null)} data-testid="nfl-proj-club">
                <option value="">All clubs</option>
                {teams.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
              </select>
            </label>
            <div role="group" aria-label="Position" className="inline-flex border border-chalk-300 rounded overflow-hidden">
              {['ALL', ...FANTASY_POSITIONS].map((p) => (
                <button key={p} type="button" aria-pressed={pos === p} onClick={() => set('pos', p === 'ALL' ? null : p)} className={`px-2.5 py-1 ${pos === p ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700'}`}>
                  {p === 'ALL' ? 'All' : p}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Scoring" className="inline-flex border border-chalk-300 rounded overflow-hidden">
              {FORMATS.map((f) => (
                <button key={f.key} type="button" aria-pressed={fmt === f.key} onClick={() => set('fmt', f.key === 'ppr' ? null : f.key)} className={`px-2.5 py-1 ${fmt === f.key ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-500">Find a player</span>
              <input className="border border-chalk-300 rounded px-2 py-1 bg-white w-40" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} placeholder="Name" />
            </label>
            {hidden > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-ink-700 pb-1">
                <input type="checkbox" checked={showOut} onChange={(e) => { setShowOut(e.target.checked); setShown(PAGE); }} data-testid="nfl-proj-show-out" />
                {`Show ${hidden} ruled out or doubtful`}
              </label>
            )}
          </div>

          <p className="text-sm text-ink-700" data-testid="nfl-proj-summary">
            {rows.length > 0
              ? `${rows.length} ${team ? `${team.name} ` : ''}players, week ${weeks.join(' and ')}, ${fmtLabel} scoring. ${projectionSentence(rows[0], fmt)}`
              : 'No players match.'}
            {firstKick && ` First kick-off ${ukKickoff({ kickoff_at: firstKick, gameday: '' })}.`}
          </p>

          <NflProjectionTable rows={rows.slice(0, shown)} fmt={fmt} />
          {rows.length > shown && (
            <button type="button" className="text-sm text-pitch-800 underline underline-offset-2" onClick={() => setShown((x) => x + PAGE)}>
              {`Show ${Math.min(PAGE, rows.length - shown)} more`}
            </button>
          )}

          <section aria-labelledby="proj-how" className="text-xs text-ink-500 max-w-prose space-y-2" data-testid="nfl-proj-method">
            <h2 id="proj-how" className="font-medium text-ink-700 text-sm">How good are these?</h2>
            <p>
              Tested on the 2025 and 2026 seasons, which the projector never saw while it was built, against simply using each player&rsquo;s season average so far. Average miss per player per game, PPR points:
            </p>
            <table className="text-xs border border-chalk-300 rounded">
              <thead className="bg-chalk-200">
                <tr>
                  <th scope="col" className="px-2 py-1 text-left">Position</th>
                  <th scope="col" className="px-2 py-1 text-right">Projector</th>
                  <th scope="col" className="px-2 py-1 text-right">Season average</th>
                  <th scope="col" className="px-2 py-1 text-left">Shown here</th>
                </tr>
              </thead>
              <tbody>
                {NP1_RESULT.map((x) => (
                  <tr key={x.pos}>
                    <th scope="row" className="px-2 py-1 text-left font-normal">{x.pos}</th>
                    <td className="px-2 py-1 text-right font-mono">{fmt1(x.projector)}</td>
                    <td className="px-2 py-1 text-right font-mono">{fmt1(x.average)}</td>
                    <td className="px-2 py-1">{x.passed ? 'Projector' : 'Season average*'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              * For running backs and kickers the projector was closer too, but not by enough to be sure, so these show the season average. Range: 6 in 10 games land inside it. Team pts: the points the betting line expects his team to score, against its usual. Matchup: how many more (+) or fewer (−) points the opponent gives up to the position than average. Q = questionable.
              {updated && ` Updated ${ukKickoff({ kickoff_at: updated, gameday: '' })}.`} Season numbers: <Link to={NFL_PLAYERS_PATH} className="text-pitch-800 underline underline-offset-2">Player Scout</Link>.
            </p>
          </section>
        </>
      )}
    </article>
  );
}

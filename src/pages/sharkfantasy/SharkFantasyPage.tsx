// ============================================================================
// src/pages/sharkfantasy/SharkFantasyPage.tsx   (/shark-fantasy)
//
// Shark Fantasy, the fictional league's fantasy game (design: project doc
// claude/shark-fantasy-design-2026-10-10.md). Admin-only while no universe is
// public; the database enforces that too (the sf_* views return nothing to
// anyone else). Tabs: My team, Round, Leaderboard, Table, Players. State in
// the URL (?u=<universe>&tab=…&r=<round>).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useAuthOptional } from '../../lib/auth';
import {
  loadSeasons, loadSeasonData, loadMyTeam, loadEntryRounds,
  type SfSeason, type SeasonData, type SfMyTeam, type SfEntryRound,
} from '../../lib/sharkFantasyApi';
import TeamTab from './TeamTab';
import RoundTab from './RoundTab';
import LeaderboardTab from './LeaderboardTab';
import TableTab from './TableTab';
import PlayersTab from './PlayersTab';
import { when } from './format';
import TestControls from './TestControls';

const TABS = [
  { id: 'team', label: 'My team' },
  { id: 'round', label: 'Round' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'table', label: 'Table' },
  { id: 'players', label: 'Players' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function SharkFantasyPage() {
  useDocumentHead({ title: 'Shark Fantasy' });
  const auth = useAuthOptional();
  const isAdmin = auth?.isAdmin ?? false;
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'team') as TabId;
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v == null) next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };

  const [seasons, setSeasons] = useState<SfSeason[] | null>(null);
  const [data, setData] = useState<SeasonData | null>(null);
  const [mine, setMine] = useState<SfMyTeam | null>(null);
  const [myRounds, setMyRounds] = useState<SfEntryRound[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    loadSeasons().then(setSeasons).catch((e) => setError(String(e.message ?? e)));
  }, [isAdmin]);

  const season = useMemo(() => {
    if (!seasons?.length) return null;
    const u = params.get('u');
    return seasons.find((s) => s.universe_id === u) ?? seasons.find((s) => s.state !== 'done' && !s.is_test) ?? seasons.find((s) => s.state !== 'done') ?? seasons[0];
  }, [seasons, params]);

  const signedIn = !!auth?.session;
  const reload = useCallback(async () => {
    if (!season) return;
    try {
      const [d, m] = await Promise.all([loadSeasonData(season), signedIn ? loadMyTeam(season.season_id) : Promise.resolve(null)]);
      setData(d); setMine(m);
      setMyRounds(m ? await loadEntryRounds(m.entry_id) : []);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [season, signedIn]);
  useEffect(() => { setData(null); void reload(); }, [reload]);

  if (auth && !auth.loading && !isAdmin) {
    return <div className="max-w-3xl mx-auto px-4 py-8"><p className="text-sm text-ink-700">This page is for admins.</p></div>;
  }

  const round = data && season ? data.rounds.find((r) => r.number === (season.current_round ?? 10)) ?? null : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5" data-testid="sf-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-ink-900">Shark Fantasy</h1>
          {season && data && (
            <p className="text-sm text-ink-700" data-testid="sf-status">
              {season.state === 'done' || !round
                ? `Season ${season.number} over${season.shield_winner ? ` · Shark Shield: ${data.clubs.find((c) => c.club_id === season.shield_winner)?.name ?? season.shield_winner}` : ''}`
                : round.state === 'open'
                  ? `Round ${round.number}${round.kind === 'finals' ? ' (Finals Sunday)' : ''} · deadline ${when(round.deadline_at)}`
                  : `Round ${round.number}${round.kind === 'finals' ? ' (Finals Sunday)' : ''} · locked · kick-off ${when(round.kickoff_at)}`}
            </p>
          )}
        </div>
        {seasons && seasons.length > 1 && (
          <label className="text-sm space-x-2"><span className="text-ink-500">League</span>
            <select className="border border-chalk-300 rounded px-2 py-1 bg-white" value={season?.universe_id ?? ''} onChange={(e) => set({ u: e.target.value, r: null })} data-testid="sf-universe">
              {seasons.map((s) => <option key={s.season_id} value={s.universe_id}>{s.universe} ({s.universe_id}), season {s.number}</option>)}
            </select>
          </label>
        )}
      </header>

      {isAdmin && seasons && (
        <TestControls season={season} onDone={async (u) => {
          const list = await loadSeasons(); setSeasons(list);
          if (u && u !== season?.universe_id) set({ u, r: null }); else await reload();
        }} />
      )}

      <nav className="flex flex-wrap gap-1 border-b border-chalk-300" aria-label="Shark Fantasy">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => set({ tab: t.id === 'team' ? null : t.id })}
            className={`px-3 py-1.5 text-sm rounded-t ${tab === t.id ? 'bg-pitch-800 text-chalk-100' : 'text-ink-700 hover:bg-chalk-200'}`}
            aria-current={tab === t.id ? 'page' : undefined}>{t.label}</button>
        ))}
      </nav>

      {error && <p className="text-sm text-loss-700" role="alert">{error}</p>}
      {seasons && !seasons.length && <p className="text-sm text-ink-700">No season yet.</p>}
      {season && !data && !error && <p className="text-sm text-ink-500">Loading…</p>}

      {season && data && (
        <>
          {tab === 'team' && <TeamTab season={season} data={data} mine={mine} myRounds={myRounds} round={round} signedIn={signedIn} email={auth?.session?.user?.email ?? ''} onChanged={reload} />}
          {tab === 'round' && <RoundTab season={season} data={data} mine={mine} myRounds={myRounds} round={params.get('r') ? Number(params.get('r')) : null} setRound={(r) => set({ r: String(r) })} onLive={reload} />}
          {tab === 'leaderboard' && <LeaderboardTab data={data} mine={mine} />}
          {tab === 'table' && <TableTab season={season} data={data} />}
          {tab === 'players' && <PlayersTab data={data} />}
        </>
      )}
    </div>
  );
}

// ============================================================================
// src/components/fpl/MyLiveScore.tsx
//
// "Your live score" on the FPL home page (Chris, 25 Oct 2026: "can any of the
// live score content stay on the Home Screen? Even just a small summary
// before needing to link to that page"). Shown for the FPL ID remembered in
// this browser: points so far, projected final, captain, players still to
// play, and a link to the full FPL Live page. Same data and scoring as
// /fpl/live (public.fpl_live_entry, scoreLiveTeam); refreshed every two
// minutes while a game is on.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchFplLive, shouldPoll, toScoreInput, type FplLiveData } from '../../lib/fplLiveApi';
import { scoreLiveTeam } from '../../lib/fplLiveScore';
import { HubCard, HubNote, HubSkeleton, HUB_LINK } from '../hub/HubParts';

const POLL_MS = 120_000;

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function MyLiveScore({ fplId, onForget }: { fplId: string; onForget: () => void }) {
  const [data, setData] = useState<FplLiveData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    fetchFplLive(Number(fplId))
      .then((d) => { if (!cancelled) { setData(d); setState('ok'); } })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [fplId]);

  const polling = !!data && shouldPoll(data.fixtures);
  useEffect(() => {
    if (!polling) return;
    const t = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchFplLive(Number(fplId)).then(setData).catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [polling, fplId]);

  const liveLink = `/fpl/live?id=${encodeURIComponent(fplId)}`;
  if (state === 'loading') {
    return (
      <HubCard title="Your live score" testId="hub-my-score">
        <HubSkeleton rows={2} rowClass="h-10" />
      </HubCard>
    );
  }
  if (state === 'error' || !data) {
    return (
      <HubCard title="Your live score" more={{ to: liveLink, label: 'FPL Live' }} testId="hub-my-score">
        <HubNote>Your team (ID {fplId}) didn&rsquo;t load. <button type="button" onClick={onForget} className={HUB_LINK}>Use a different ID</button></HubNote>
      </HubCard>
    );
  }

  const score = scoreLiveTeam(toScoreInput(data));
  const counted = score.players.filter((p) => p.multiplier > 0);
  const toPlay = counted.filter((p) => p.hasFixture && !p.done).length;
  const captain = score.players.find((p) => p.element === score.captain);
  const anyProjection = data.projections.size > 0;
  const showProjection = anyProjection && !score.allDone;

  return (
    <HubCard title="Your live score" more={{ to: liveLink, label: 'Full live score' }} testId="hub-my-score">
      <div className="px-4 py-3 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-sm text-ink-700">{data.entry.name}</p>
          <p className="font-display text-4xl text-ink-900 tabular-nums leading-tight" data-testid="hub-my-points">{fmt(score.net)}</p>
          <p className="text-xs text-ink-500">
            Gameweek {data.event.id} points{score.hits > 0 ? `, after a ${score.hits}-point hit` : ''}
          </p>
        </div>
        {showProjection && (
          <div>
            <p className="font-display text-2xl text-ink-900 tabular-nums leading-tight" data-testid="hub-my-projected">{score.projectedFinal.toFixed(1)}</p>
            <p className="text-xs text-ink-500">Projected final</p>
          </div>
        )}
        <ul className="text-sm text-ink-700 space-y-0.5">
          {captain && (
            <li>
              Captain: <span className="font-medium text-ink-900">{captain.webName}</span> {fmt(captain.points * captain.multiplier)} pts
              {score.viceCaptainActive ? ' (vice-captain)' : ''}
            </li>
          )}
          <li>{score.allDone ? 'Every player has played' : `${toPlay} of ${counted.length} still to play`}</li>
          {score.autoSubs.length > 0 && <li>{score.autoSubs.length} automatic sub{score.autoSubs.length > 1 ? 's' : ''}</li>}
        </ul>
      </div>
      <p className="px-4 py-2.5 border-t border-chalk-200 text-xs text-ink-500">
        Bonus as it stands; FPL confirms it after each game.{' '}
        <Link to={liveLink} className={HUB_LINK}>Player by player</Link>
        {' · '}
        <button type="button" onClick={onForget} className={HUB_LINK}>Not your team?</button>
      </p>
    </HubCard>
  );
}

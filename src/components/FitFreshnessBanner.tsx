// ============================================================================
// src/components/FitFreshnessBanner.tsx
//
// Surfaces two things that were previously only visible on the Data Health
// page: the production fit for a league going stale (the daily pipeline
// hasn't produced a new ACCEPTED fit in a while), and the most recent
// refit attempt having been rejected (so predictions are quietly running
// on an older fit than the pipeline actually tried to produce). Neither
// case is an error the person did anything wrong to cause -- it's
// informational, hence amber rather than the loss-red error style.
// ============================================================================

import { useEffect, useState } from 'react';
import { getLeagueFitStatusFor, type LeagueFitStatus } from '../lib/api';
import type { ModelFitRun } from '../types/database';

// The daily pipeline runs once every ~24h -- give it a generous buffer
// past that before calling the production fit "stale" rather than just
// "hasn't run again yet today".
const STALE_HOURS = 36;

function formatAgo(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function FitFreshnessBanner({ leagueId, fitRun }: { leagueId: number | null; fitRun: ModelFitRun | null }) {
  const [status, setStatus] = useState<LeagueFitStatus | null>(null);

  useEffect(() => {
    if (!leagueId) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    getLeagueFitStatusFor(leagueId)
      .then((row) => {
        if (!cancelled) setStatus(row);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  if (!leagueId) return null;

  if (!fitRun) {
    // No accepted fit at all -- this is the harder failure case, not just staleness.
    return (
      <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded-lg text-sm">
        No validated model fit exists yet for this competition, so predictions aren't available.
      </div>
    );
  }

  const messages: string[] = [];

  const hoursOld = (Date.now() - new Date(fitRun.fitted_at).getTime()) / 36e5;
  if (hoursOld > STALE_HOURS) {
    messages.push(`Predictions haven't been refreshed since ${formatAgo(fitRun.fitted_at)} \u2014 may be out of date.`);
  }

  if (
    status &&
    status.latest_attempted_fit_run_id !== null &&
    status.latest_attempted_fit_run_id !== status.accepted_fit_run_id &&
    status.latest_attempted_status === 'rejected'
  ) {
    messages.push(
      `The most recent refit attempt was rejected${status.latest_attempted_rejection_reason ? ` (${status.latest_attempted_rejection_reason})` : ''} \u2014 showing the last good fit instead.`
    );
  }

  if (messages.length === 0) return null;

  return (
    <div className="border border-amber-500 bg-amber-400/15 rounded-lg px-4 py-3 text-sm text-ink-700 space-y-1">
      {messages.map((m, i) => (
        <p key={i}>{m}</p>
      ))}
    </div>
  );
}

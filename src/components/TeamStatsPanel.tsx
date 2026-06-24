import { useState } from 'react';
import {
  summarizeForm,
  splitHomeAway,
  buildMatchTrend,
  calculateGoalsDistribution,
  type MatchWithNames,
} from '../lib/api';
import { formatMatchDate } from '../lib/formatDate';
import { ScoreChip, FormBadge } from './ScoreChip';
import { GoalTrendChart } from './GoalTrendChart';
import { FormSequenceChart } from './FormSequenceChart';
import { GoalsDistributionTable } from './GoalsDistributionTable';

type TeamOption = { team_id: number; canonical_name: string };
type RollingWindow = 10 | 20 | 30 | 'season';
type Venue = 'combined' | 'home' | 'away';

/**
 * The full per-team stats view: home/away/overall form panels, the goals
 * distribution table (with rolling-window and venue controls), trend
 * charts, and a recent-matches list. Originally built for Team Explorer;
 * extracted so Match Preview can show the exact same view per-team without
 * duplicating logic, and can additionally pass a `modelled` prediction
 * (Dixon-Coles expected goals for a specific upcoming fixture) into the
 * distribution table for comparison.
 */
export function TeamStatsPanel({
  team,
  matches,
  modelled,
}: {
  team: TeamOption;
  matches: MatchWithNames[];
  /** Dixon-Coles expected goals for THIS team in a specific upcoming fixture, shown as a comparison row. */
  modelled?: { goalsFor: number; goalsAgainst: number };
}) {
  const [rollingWindow, setRollingWindow] = useState<RollingWindow>(10);
  const [venue, setVenue] = useState<Venue>('combined');

  const windowedMatches = rollingWindow === 'season' ? matches : matches.slice(0, rollingWindow);

  const overall = summarizeForm(windowedMatches, team.team_id);
  const { home, away } = splitHomeAway(windowedMatches, team.team_id);
  const homeForm = summarizeForm(home, team.team_id);
  const awayForm = summarizeForm(away, team.team_id);

  const venueMatches = venue === 'home' ? home : venue === 'away' ? away : windowedMatches;
  const distribution = venueMatches.length > 0 ? calculateGoalsDistribution(venueMatches, team.team_id) : null;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-4">
        <StatPanel title={`Overall (last ${overall.played})`} summary={overall} />
        <StatPanel title="Home form" summary={homeForm} />
        <StatPanel title="Away form" summary={awayForm} />
      </div>

      <div className="border border-chalk-300 rounded-lg bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-display uppercase text-sm tracking-wide text-ink-500">
            Goals distribution &mdash; {team.canonical_name}
          </h2>
          <div className="flex gap-2 text-xs">
            <SegmentedControl
              options={[
                { value: 10, label: '10' },
                { value: 20, label: '20' },
                { value: 30, label: '30' },
                { value: 'season', label: 'Season' },
              ]}
              value={rollingWindow}
              onChange={(v) => setRollingWindow(v as RollingWindow)}
            />
            <SegmentedControl
              options={[
                { value: 'combined', label: 'Combined' },
                { value: 'home', label: 'Home' },
                { value: 'away', label: 'Away' },
              ]}
              value={venue}
              onChange={(v) => setVenue(v as Venue)}
            />
          </div>
        </div>
        {distribution ? (
          <GoalsDistributionTable
            stats={distribution}
            windowLabel={`Rolling last ${rollingWindow === 'season' ? 'season' : rollingWindow}, ${venue}`}
            modelled={modelled}
          />
        ) : (
          <p className="text-sm text-ink-500">Not enough match data for this selection yet.</p>
        )}
      </div>

      <div className="border border-chalk-300 rounded-lg bg-white p-4">
        <h2 className="font-display uppercase text-sm tracking-wide text-ink-500 mb-3">
          Goals trend &mdash; last {Math.min(matches.length, 15)} matches
        </h2>
        <GoalTrendChart data={buildMatchTrend(matches.slice(0, 15), team.team_id)} />
      </div>

      <div className="border border-chalk-300 rounded-lg bg-white p-4">
        <h2 className="font-display uppercase text-sm tracking-wide text-ink-500 mb-3">
          Form &mdash; last {Math.min(matches.length, 15)} matches
        </h2>
        <FormSequenceChart data={buildMatchTrend(matches.slice(0, 15), team.team_id)} />
      </div>

      <div className="border border-chalk-300 rounded-lg overflow-hidden bg-white">
        <div className="px-4 py-2 bg-pitch-900 text-chalk-100 font-display uppercase text-sm tracking-wide">
          Recent matches &mdash; {team.canonical_name}
        </div>
        <ul className="divide-y divide-chalk-300">
          {matches.slice(0, 15).map((m) => (
            <li key={m.match_id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3">
              <span className="font-mono text-xs text-ink-500 w-24 shrink-0">{formatMatchDate(m.match_date)}</span>
              <span className="font-mono text-xs uppercase text-pitch-700 font-semibold w-12 shrink-0">
                {m.league_code}
              </span>
              <div className="flex-1 flex items-center justify-between gap-3 min-w-0">
                <span className="truncate font-medium">{m.home_team_name}</span>
                <ScoreChip homeGoals={m.full_time_home_goals} awayGoals={m.full_time_away_goals} size="sm" />
                <span className="truncate font-medium text-right">{m.away_team_name}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex border border-chalk-300 rounded overflow-hidden">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className={[
            'px-2.5 py-1 font-mono transition-colors',
            value === opt.value ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700 hover:bg-chalk-100',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function StatPanel({ title, summary }: { title: string; summary: ReturnType<typeof summarizeForm> }) {
  return (
    <div className="border border-chalk-300 rounded-lg bg-white p-4">
      <h2 className="font-display uppercase text-sm tracking-wide text-ink-500 mb-3">{title}</h2>
      <div className="flex gap-1 mb-3">
        {summary.form.slice(0, 8).map((r, i) => (
          <FormBadge key={i} result={r} />
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-y-1 text-sm font-mono">
        <dt className="text-ink-500">Record</dt>
        <dd className="text-right">
          {summary.wins}W {summary.draws}D {summary.losses}L
        </dd>
        <dt className="text-ink-500">Goals for</dt>
        <dd className="text-right">{summary.goalsFor}</dd>
        <dt className="text-ink-500">Goals against</dt>
        <dd className="text-right">{summary.goalsAgainst}</dd>
        <dt className="text-ink-500">Goal difference</dt>
        <dd className="text-right">
          {summary.goalDifference >= 0 ? '+' : ''}
          {summary.goalDifference}
        </dd>
      </dl>
    </div>
  );
}

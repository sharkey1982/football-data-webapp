import { useState } from 'react';
import {
  summarizeForm,
  splitHomeAway,
  buildFormEntries,
  calculateGoalsDistribution,
  type MatchWithNames,
} from '../lib/api';
import { formatMatchDate } from '../lib/formatDate';
import { ScoreChip, FormBadge } from './ScoreChip';
import { GoalsDistributionTable } from './GoalsDistributionTable';
import { ScoreProbabilityGrid } from './ScoreProbabilityGrid';
import type { DixonColesResult } from '../lib/dixonColes';

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
  dixonColes,
  fixtureHomeTeamName,
  fixtureAwayTeamName,
}: {
  team: TeamOption;
  matches: MatchWithNames[];
  /** Dixon-Coles expected goals for THIS team in a specific upcoming fixture, shown as a comparison row. */
  modelled?: { goalsFor: number; goalsAgainst: number };
  /**
   * The full fixture-level Dixon-Coles result (same for both the Home and
   * Away tabs, since it's the model's output for the one upcoming fixture
   * being previewed, not specific to either team's perspective). Only
   * passed from Match Preview -- Team Explorer has no fixture context, so
   * this is undefined there and the box simply doesn't render.
   */
  dixonColes?: DixonColesResult | null;
  /** The fixture's actual home/away team names, for the score grid's axis labels. */
  fixtureHomeTeamName?: string;
  fixtureAwayTeamName?: string;
}) {
  const [rollingWindow, setRollingWindow] = useState<RollingWindow>(10);
  const [venue, setVenue] = useState<Venue>('combined');
  const [distributionView, setDistributionView] = useState<'count' | 'pct'>('count');
  const [showGrid, setShowGrid] = useState(false);

  // The top stat panels (Overall / Home form / Away form) intentionally show
  // "the last N games overall, split by venue within that window" -- e.g.
  // your home record specifically within your last 10 games.
  const windowedMatches = matches.slice(0, 10);
  const overall = summarizeForm(windowedMatches, team.team_id);
  const { home, away } = splitHomeAway(windowedMatches, team.team_id);
  const homeForm = summarizeForm(home, team.team_id);
  const awayForm = summarizeForm(away, team.team_id);

  // The Goals Distribution table means something different: "last N home
  // games" should be N actual home fixtures, not whatever fraction of a
  // generic N-game window happened to be home. So venue filtering happens
  // FIRST here, then the rolling window is taken from that already-venue-
  // filtered list -- the opposite order from the panels above.
  const venueFilteredMatches =
    venue === 'home'
      ? matches.filter((m) => m.home_team_id === team.team_id)
      : venue === 'away'
        ? matches.filter((m) => m.away_team_id === team.team_id)
        : matches;
  const distributionMatches =
    rollingWindow === 'season' ? venueFilteredMatches : venueFilteredMatches.slice(0, rollingWindow);
  const distribution =
    distributionMatches.length > 0 ? calculateGoalsDistribution(distributionMatches, team.team_id) : null;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-4">
        <StatPanel title={`Overall (last ${overall.played})`} summary={overall} matches={windowedMatches} team={team} />
        <StatPanel title="Home form" summary={homeForm} matches={home} team={team} />
        <StatPanel title="Away form" summary={awayForm} matches={away} team={team} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="border border-chalk-300 rounded-lg bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="font-display uppercase text-sm tracking-wide text-ink-500">
              Goals distribution &mdash; {team.canonical_name}
            </h2>
            <div className="flex flex-wrap gap-2 text-xs">
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
              <SegmentedControl
                options={[
                  { value: 'count', label: '#' },
                  { value: 'pct', label: '%' },
                ]}
                value={distributionView}
                onChange={(v) => setDistributionView(v as 'count' | 'pct')}
              />
            </div>
          </div>
          {distribution ? (
            <GoalsDistributionTable
              stats={distribution}
              windowLabel={`Rolling last ${rollingWindow === 'season' ? 'season' : rollingWindow}, ${venue}`}
              modelled={modelled}
              viewMode={distributionView}
            />
          ) : (
            <p className="text-sm text-ink-500">Not enough match data for this selection yet.</p>
          )}
        </div>

        {dixonColes && (
          <div className="border border-chalk-300 rounded-lg bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display uppercase text-sm tracking-wide text-ink-500">
                Dixon-Coles expected goals
              </h2>
              <span className="font-mono text-lg font-bold text-pitch-800">
                {dixonColes.expectedHomeGoals.toFixed(2)} &ndash; {dixonColes.expectedAwayGoals.toFixed(2)}
              </span>
            </div>
            <button
              onClick={() => setShowGrid((v) => !v)}
              className="text-sm text-pitch-700 underline hover:text-pitch-800"
            >
              {showGrid ? 'Hide' : 'Show'} full scoreline probabilities
            </button>
            {showGrid && (
              <div className="mt-4">
                <ScoreProbabilityGrid
                  result={dixonColes}
                  homeTeamName={fixtureHomeTeamName ?? 'Home'}
                  awayTeamName={fixtureAwayTeamName ?? 'Away'}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border border-chalk-300 rounded-lg overflow-hidden bg-white overflow-x-auto">
        <div className="px-4 py-2 bg-pitch-900 text-chalk-100 font-display uppercase text-sm tracking-wide">
          Recent matches &mdash; {team.canonical_name}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-chalk-300 text-ink-500">
              <th className="text-left font-mono text-xs px-3 py-2 whitespace-nowrap">Date</th>
              <th className="text-left font-mono text-xs px-3 py-2">Div</th>
              <th className="text-right font-mono text-xs px-3 py-2">Home</th>
              <th className="text-center font-mono text-xs px-3 py-2">Score</th>
              <th className="text-left font-mono text-xs px-3 py-2">Away</th>
              <th className="text-center font-mono text-xs px-3 py-2">HT</th>
              <th className="text-center font-mono text-xs px-3 py-2">Shots</th>
              <th className="text-center font-mono text-xs px-3 py-2">Corners</th>
              <th className="text-center font-mono text-xs px-3 py-2">Cards</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-chalk-200">
            {matches.slice(0, 15).map((m) => (
              <tr key={m.match_id} className="hover:bg-chalk-100 transition-colors">
                <td className="px-3 py-2 font-mono text-xs text-ink-500 whitespace-nowrap">
                  {formatMatchDate(m.match_date)}
                </td>
                <td className="px-3 py-2 font-mono text-xs uppercase text-pitch-700 font-semibold">
                  {m.league_code}
                </td>
                <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{m.home_team_name}</td>
                <td className="px-3 py-2 text-center">
                  <ScoreChip homeGoals={m.full_time_home_goals} awayGoals={m.full_time_away_goals} size="sm" />
                </td>
                <td className="px-3 py-2 font-medium whitespace-nowrap">{m.away_team_name}</td>
                <td className="px-3 py-2 text-center font-mono text-xs text-ink-500 whitespace-nowrap">
                  {m.half_time_home_goals ?? '–'}&ndash;{m.half_time_away_goals ?? '–'}
                </td>
                <td className="px-3 py-2 text-center font-mono text-xs text-ink-500 whitespace-nowrap">
                  {m.home_shots ?? '–'}&ndash;{m.away_shots ?? '–'}
                </td>
                <td className="px-3 py-2 text-center font-mono text-xs text-ink-500 whitespace-nowrap">
                  {m.home_corners ?? '–'}&ndash;{m.away_corners ?? '–'}
                </td>
                <td className="px-3 py-2 text-center font-mono text-xs text-ink-500 whitespace-nowrap">
                  {m.home_yellow_cards}/{m.home_red_cards}&ndash;{m.away_yellow_cards}/{m.away_red_cards}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

function StatPanel({
  title,
  summary,
  matches,
  team,
}: {
  title: string;
  summary: ReturnType<typeof summarizeForm>;
  matches: MatchWithNames[];
  team: TeamOption;
}) {
  const formEntries = buildFormEntries(matches.slice(0, 8), team.team_id);
  return (
    <div className="border border-chalk-300 rounded-lg bg-white p-4">
      <h2 className="font-display uppercase text-sm tracking-wide text-ink-500 mb-3">{title}</h2>
      <div className="flex gap-1 mb-3">
        {formEntries.map((entry, i) => (
          <FormBadge key={i} result={entry.result} detail={entry.detail} />
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

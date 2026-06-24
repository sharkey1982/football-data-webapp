import { FormBadge } from './ScoreChip';
import type { TeamStreaks } from '../lib/api';
import type { FormResult } from '../lib/api';

export function ComparisonCard({
  homeTeamName,
  awayTeamName,
  homeForm,
  awayForm,
  homeWinPct,
  drawPct,
  awayWinPct,
}: {
  homeTeamName: string;
  awayTeamName: string;
  homeForm: FormResult[];
  awayForm: FormResult[];
  homeWinPct?: number;
  drawPct?: number;
  awayWinPct?: number;
}) {
  const hasPrediction = homeWinPct !== undefined && drawPct !== undefined && awayWinPct !== undefined;

  return (
    <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-chalk-300">
        <TeamColumn name={homeTeamName} form={homeForm} align="left" />
        <TeamColumn name={awayTeamName} form={awayForm} align="right" />
      </div>

      {hasPrediction && (
        <div className="border-t border-chalk-300 bg-chalk-100 px-4 py-3">
          <div className="flex h-3 rounded-full overflow-hidden mb-2">
            <div style={{ width: `${homeWinPct}%`, backgroundColor: '#1B4332' }} />
            <div style={{ width: `${drawPct}%`, backgroundColor: '#d8d2bd' }} />
            <div style={{ width: `${awayWinPct}%`, backgroundColor: '#A63D40' }} />
          </div>
          <div className="flex justify-between text-xs font-mono text-ink-700">
            <span>{homeWinPct!.toFixed(0)}%</span>
            <span className="text-ink-500">{drawPct!.toFixed(0)}% draw</span>
            <span>{awayWinPct!.toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamColumn({ name, form, align }: { name: string; form: FormResult[]; align: 'left' | 'right' }) {
  return (
    <div className={`p-4 ${align === 'right' ? 'text-right' : ''}`}>
      <div className="font-display uppercase text-lg tracking-wide truncate">{name}</div>
      <div className={`flex gap-1 mt-2 ${align === 'right' ? 'justify-end' : ''}`}>
        {(align === 'right' ? [...form].reverse() : form).slice(0, 5).map((r, i) => (
          <FormBadge key={i} result={r} />
        ))}
      </div>
    </div>
  );
}

const STREAK_DEFINITIONS: Array<{
  key: keyof TeamStreaks;
  threshold: number;
  label: (n: number) => string;
  icon: string;
}> = [
  { key: 'unbeaten', threshold: 3, label: (n) => `Unbeaten in ${n}`, icon: '🛡️' },
  { key: 'winning', threshold: 3, label: (n) => `Won last ${n}`, icon: '🔥' },
  { key: 'cleanSheets', threshold: 2, label: (n) => `Clean sheet in ${n} straight`, icon: '🧱' },
  { key: 'scoringIn', threshold: 4, label: (n) => `Scored in ${n} straight`, icon: '⚽' },
];

/** Renders streak callouts as badge chips, only showing streaks that clear a minimum length worth mentioning. */
export function StreakBadges({ teamName, streaks }: { teamName: string; streaks: TeamStreaks }) {
  const active = STREAK_DEFINITIONS.filter((def) => streaks[def.key] >= def.threshold);

  if (active.length === 0) {
    return <p className="text-xs text-ink-500">No notable streaks for {teamName} right now.</p>;
  }

  return (
    <div className="space-y-1.5">
      {active.map((def) => (
        <div key={def.key} className="flex items-center gap-2 text-sm">
          <span aria-hidden="true">{def.icon}</span>
          <span>
            <strong>{teamName}</strong> &mdash; {def.label(streaks[def.key])}
          </span>
        </div>
      ))}
    </div>
  );
}

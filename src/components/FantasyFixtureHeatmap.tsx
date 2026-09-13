export type FantasyFocus = 'attack' | 'defence';
export type FantasyColourBasis = 'model' | 'fdr';
export type FantasyMetric = 'xgf' | 'xga' | 'cleansheet' | 'fdr';

const METRIC_LABEL: Record<FantasyMetric, string> = {
  xgf: 'xGF',
  xga: 'xGA',
  cleansheet: 'Clean sheet chance',
  fdr: 'FDR',
};

function formatMetricValue(metric: FantasyMetric, value: number): string {
  if (metric === 'cleansheet') return `${Math.round(value * 100)}%`;
  if (metric === 'fdr') return value.toFixed(0);
  return value.toFixed(1);
}

function formatWindowTotal(metric: FantasyMetric, total: number): string {
  if (metric === 'fdr') return total.toFixed(0);
  return total.toFixed(1); // goals sum, or expected clean sheets (sum of per-match probabilities)
}

function windowTotalTitle(metric: FantasyMetric, fixtureCount: number): string {
  if (metric === 'cleansheet') {
    return `Expected clean sheets across the ${fixtureCount}-fixture window (sum of each match's clean sheet probability)`;
  }
  return `Total ${METRIC_LABEL[metric]} across the ${fixtureCount}-fixture ranking window`;
}

export interface FantasyHeatmapCell {
  matchweek: number;
  opponent_name: string;
  is_home: boolean;
  /** Raw number shown in the cell/tooltip -- expected goals, clean sheet probability (0-1), or FDR rating. */
  value: number;
  /** 1 (easiest) to 5 (hardest), already oriented for the current focus/metric. */
  difficulty: number;
}

export interface FantasyHeatmapRow {
  team_id: number;
  team_name: string;
  /** Average difficulty across the ranking window -- what rows are sorted by. */
  rankValue: number;
  /** Sum of the raw metric across the ranking window -- shown next to the team name. */
  windowTotal: number;
  cellsByMatchweek: Map<number, FantasyHeatmapCell>;
}

// Blend pitch-green (easy) -> chalk (neutral) -> loss-red (hard) using the
// app's own design tokens rather than an arbitrary palette, matching the
// amber interpolation ScoreProbabilityGrid already uses for its heat cells.
const EASY = { r: 0x35, g: 0x75, b: 0x56 }; // --color-pitch-600
const MID = { r: 0xe8, g: 0xe4, b: 0xd4 }; // --color-chalk-200
const HARD = { r: 0xa6, g: 0x3d, b: 0x40 }; // --color-loss-600

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

/** difficulty: 1 (easiest) to 5 (hardest). */
function difficultyColor(difficulty: number): string {
  const t = Math.max(0, Math.min(1, (difficulty - 1) / 4));
  const [from, to, localT] = t < 0.5 ? [EASY, MID, t / 0.5] : [MID, HARD, (t - 0.5) / 0.5];
  const r = lerp(from.r, to.r, localT);
  const g = lerp(from.g, to.g, localT);
  const b = lerp(from.b, to.b, localT);
  return `rgb(${r}, ${g}, ${b})`;
}

function difficultyTextClass(difficulty: number): string {
  // The two ends of the scale are dark enough to need light text; the
  // neutral middle stays dark-on-light like the rest of the app.
  return difficulty <= 1.75 || difficulty >= 4.25 ? 'text-chalk-100' : 'text-ink-900';
}

export default function FantasyFixtureHeatmap({
  rows,
  matchweeks,
  metric,
}: {
  rows: FantasyHeatmapRow[];
  matchweeks: number[];
  metric: FantasyMetric;
}) {
  return (
    <div className="overflow-x-auto border border-chalk-300 rounded-lg bg-white">
      <table className="border-collapse text-sm w-full">
        <thead>
          <tr>
            <th className="sticky left-0 bg-chalk-200 text-left text-xs font-medium text-ink-500 px-2 py-1.5 z-10 min-w-[9rem]">
              Team
            </th>
            {matchweeks.map((mw) => (
              <th key={mw} className="text-xs font-mono font-medium text-ink-500 px-1 py-1.5 min-w-[4rem]">
                GW{mw}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.team_id} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
              <th
                data-testid="team-row-name"
                className="sticky left-0 bg-inherit text-left text-xs font-medium text-ink-900 px-2 py-1 whitespace-nowrap z-10"
              >
                {row.team_name}
                <sub
                  data-testid="team-window-total"
                  className="ml-1 text-[10px] font-mono font-normal text-ink-500"
                  title={windowTotalTitle(metric, matchweeks.length)}
                >
                  {formatWindowTotal(metric, row.windowTotal)}
                </sub>
              </th>
              {matchweeks.map((mw) => {
                const cell = row.cellsByMatchweek.get(mw);
                if (!cell) {
                  return (
                    <td key={mw} className="text-center text-xs text-ink-500 border border-chalk-200 px-1 py-1">
                      &ndash;
                    </td>
                  );
                }
                return (
                  <td
                    key={mw}
                    className={[
                      'text-center font-mono text-[11px] border border-chalk-200 px-1 py-1',
                      difficultyTextClass(cell.difficulty),
                    ].join(' ')}
                    style={{ backgroundColor: difficultyColor(cell.difficulty) }}
                    title={`GW${mw}: ${row.team_name} ${cell.is_home ? 'vs' : '@'} ${cell.opponent_name} -- ${METRIC_LABEL[metric]} ${formatMetricValue(metric, cell.value)}`}
                  >
                    <div className="leading-tight font-semibold">
                      {cell.opponent_name.slice(0, 3).toUpperCase()} - {cell.is_home ? 'H' : 'A'}
                    </div>
                    <div className="leading-tight opacity-80">{formatMetricValue(metric, cell.value)}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

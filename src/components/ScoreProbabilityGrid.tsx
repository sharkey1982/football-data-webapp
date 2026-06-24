import type { DixonColesResult } from '../lib/dixonColes';

/**
 * Renders the full home-goals x away-goals probability grid as a heatmap-
 * style table. This is the "transparent calculation" piece -- rather than
 * just stating win/draw/loss percentages, it shows exactly how those
 * numbers were built up from individual scoreline probabilities.
 */
export function ScoreProbabilityGrid({
  result,
  homeTeamName,
  awayTeamName,
}: {
  result: DixonColesResult;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const displayMax = Math.min(result.maxGoals, 6); // 6 is plenty to show visually; tail beyond this is negligible
  const maxProb = Math.max(...result.scoreGrid.flat());

  function cellColor(prob: number): string {
    const intensity = maxProb > 0 ? prob / maxProb : 0;
    // Interpolate between chalk (low prob) and amber (high prob) using the
    // app's own design tokens, not arbitrary colors.
    const alpha = 0.08 + intensity * 0.85;
    return `rgba(212, 160, 60, ${alpha})`; // --color-amber-500
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm mx-auto">
        <caption className="text-xs text-ink-500 mb-2 text-left">
          Each cell is the modelled probability of that exact final score. Darker = more likely.
        </caption>
        <thead>
          <tr>
            <th className="p-1" colSpan={2}></th>
            <th colSpan={displayMax + 1} className="text-xs font-medium text-ink-500 pb-1">
              {awayTeamName} goals &rarr;
            </th>
          </tr>
          <tr>
            <th className="p-1" colSpan={2}></th>
            {Array.from({ length: displayMax + 1 }, (_, a) => (
              <th key={a} className="w-9 h-7 text-xs font-mono font-medium text-ink-500">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: displayMax + 1 }, (_, h) => (
            <tr key={h}>
              {h === 0 && (
                <th
                  rowSpan={displayMax + 1}
                  className="text-xs font-medium text-ink-500 pr-2 align-middle"
                  style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                >
                  &larr; {homeTeamName} goals
                </th>
              )}
              <th className="w-9 h-9 text-xs font-mono font-medium text-ink-500 pr-1">{h}</th>
              {Array.from({ length: displayMax + 1 }, (_, a) => {
                const prob = result.scoreGrid[h][a];
                return (
                  <td
                    key={a}
                    className="w-9 h-9 text-center font-mono text-xs border border-chalk-200"
                    style={{ backgroundColor: cellColor(prob) }}
                    title={`${h}-${a}: ${(prob * 100).toFixed(1)}%`}
                  >
                    {(prob * 100).toFixed(1)}
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

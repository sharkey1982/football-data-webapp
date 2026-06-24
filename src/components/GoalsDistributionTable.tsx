import type { GoalsDistributionStats } from '../lib/api';

/**
 * Renders the GF/GA/Net distribution table for a rolling window of matches
 * -- bucketed counts (0, 1, 2, 3+), then median/mode/mean summary rows.
 * Optionally takes a "modelled" row (the Dixon-Coles expected-goals output
 * for an upcoming fixture) to show alongside the historical numbers, so a
 * user can compare "what the model expects next" against "what actually
 * happened recently" in one glance.
 *
 * `viewMode` toggles the bucket rows between raw match counts and percentage
 * of the total matches in this window -- median/mode/mean always stay as
 * actual goal values regardless, since percentaging a median doesn't mean
 * anything.
 */
export function GoalsDistributionTable({
  stats,
  windowLabel,
  modelled,
  viewMode = 'count',
}: {
  stats: { goalsFor: GoalsDistributionStats; goalsAgainst: GoalsDistributionStats; net: GoalsDistributionStats };
  windowLabel: string;
  modelled?: { goalsFor: number; goalsAgainst: number };
  viewMode?: 'count' | 'pct';
}) {
  const buckets: Array<'0' | '1' | '2' | '3+'> = ['0', '1', '2', '3+'];

  const totalMatches =
    stats.goalsFor.bucketCounts['0'] +
    stats.goalsFor.bucketCounts['1'] +
    stats.goalsFor.bucketCounts['2'] +
    stats.goalsFor.bucketCounts['3+'];

  function displayValue(count: number): string {
    if (viewMode === 'pct') {
      return totalMatches > 0 ? `${((count / totalMatches) * 100).toFixed(0)}%` : '0%';
    }
    return String(count);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <caption className="text-xs text-ink-500 text-left mb-2">
          {windowLabel} ({totalMatches} match{totalMatches === 1 ? '' : 'es'})
        </caption>
        <thead>
          <tr className="border-b border-chalk-300">
            <th className="text-left py-1.5 pr-3 text-ink-500 font-medium text-xs uppercase tracking-wide">
              Goals
            </th>
            <th className="text-right py-1.5 px-2 font-mono text-xs text-ink-500">GF</th>
            <th className="text-right py-1.5 px-2 font-mono text-xs text-ink-500">GA</th>
            <th className="text-right py-1.5 pl-2 font-mono text-xs text-ink-500">Net</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b} className="border-b border-chalk-200">
              <td className="py-1 pr-3 font-mono text-ink-700">{b}</td>
              <td className="py-1 px-2 text-right font-mono">{displayValue(stats.goalsFor.bucketCounts[b])}</td>
              <td className="py-1 px-2 text-right font-mono">{displayValue(stats.goalsAgainst.bucketCounts[b])}</td>
              <td className="py-1 pl-2 text-right font-mono">{displayValue(stats.net.bucketCounts[b])}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-chalk-300">
            <td className="py-1 pr-3 font-medium text-ink-700">Median</td>
            <td className="py-1 px-2 text-right font-mono">{stats.goalsFor.median}</td>
            <td className="py-1 px-2 text-right font-mono">{stats.goalsAgainst.median}</td>
            <td className="py-1 pl-2 text-right font-mono">{stats.net.median}</td>
          </tr>
          <tr>
            <td className="py-1 pr-3 font-medium text-ink-700">Mode</td>
            <td className="py-1 px-2 text-right font-mono">{stats.goalsFor.mode}</td>
            <td className="py-1 px-2 text-right font-mono">{stats.goalsAgainst.mode}</td>
            <td className="py-1 pl-2 text-right font-mono">{stats.net.mode}</td>
          </tr>
          <tr>
            <td className="py-1 pr-3 font-medium text-ink-700">Mean</td>
            <td className="py-1 px-2 text-right font-mono">{stats.goalsFor.mean.toFixed(2)}</td>
            <td className="py-1 px-2 text-right font-mono">{stats.goalsAgainst.mean.toFixed(2)}</td>
            <td className="py-1 pl-2 text-right font-mono">{stats.net.mean.toFixed(2)}</td>
          </tr>
          {modelled && (
            <tr className="border-t-2 border-amber-500 bg-amber-400/10">
              <td className="py-1 pr-3 font-medium text-pitch-800">Modelled</td>
              <td className="py-1 px-2 text-right font-mono font-bold text-pitch-800">
                {modelled.goalsFor.toFixed(2)}
              </td>
              <td className="py-1 px-2 text-right font-mono font-bold text-pitch-800">
                {modelled.goalsAgainst.toFixed(2)}
              </td>
              <td className="py-1 pl-2 text-right font-mono font-bold text-pitch-800">
                {(modelled.goalsFor - modelled.goalsAgainst).toFixed(2)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {modelled && (
        <p className="text-xs text-ink-500 mt-2">
          &ldquo;Modelled&rdquo; is the Dixon-Coles expected-goals estimate for an upcoming fixture (from Match
          Preview) &mdash; shown here for comparison against this team&rsquo;s actual recent history, not a
          historical statistic itself.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// src/components/nfl/NflMarginChart.tsx
//
// "How might it finish?" -- the chance of each winning margin, away side's
// wins on the left, home side's on the right (src/lib/nflMargin.ts). The
// NFL's answer to the football page's scoreline grid.
//
// Colours are the win-chance bar's (ComparisonCard): home pitch-800, away
// loss-600, tie chalk. Under colour-blindness that pair is only ~7.6 ΔE
// apart, so side is never colour alone: position (away left, home right),
// the team names over each half, and a table for screen readers.
// ============================================================================

import { likeliestMargins, marginBuckets, marginDistribution } from '../../lib/nflMargin';

const FILL = { home: '#1B4332', away: '#A63D40', tie: '#d8d2bd' } as const;

const bandLabel = (from: number, to: number) => (to >= 70 ? `${from}+` : from === to ? `${from}` : `${from}–${to}`);
const pctText = (p: number) => (p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);

export default function NflMarginChart({
  expectedMargin,
  homeName,
  awayName,
  homeShort,
  awayShort,
}: {
  expectedMargin: number;
  homeName: string;
  awayName: string;
  homeShort: string;
  awayShort: string;
}) {
  const dist = marginDistribution(Number(expectedMargin));
  const buckets = marginBuckets(dist);
  const max = Math.max(...buckets.map((b) => b.p));
  const top = likeliestMargins(dist);
  const name = (b: { side: 'home' | 'away' | 'tie' }) => (b.side === 'home' ? homeName : b.side === 'away' ? awayName : '');
  const describe = (b: (typeof buckets)[number]) => (b.side === 'tie' ? `Tie: ${pctText(b.p)}` : `${name(b)} by ${bandLabel(b.from, b.to)}: ${pctText(b.p)}`);

  return (
    <figure className="mt-3" data-testid="nfl-margin-chart">
      <figcaption className="font-display uppercase text-sm tracking-wide text-ink-500">How it might finish: winning margin</figcaption>
      <div className="mt-2 max-w-xl">
        <div className="flex justify-between text-xs text-ink-700 mb-1" aria-hidden="true">
          <span>{`← ${awayShort} win by`}</span>
          <span>{`${homeShort} win by →`}</span>
        </div>
        <div className="flex items-end gap-[2px] h-32 border-b border-chalk-300" aria-hidden="true">
          {buckets.map((b) => (
            <div key={b.key} className="flex-1 h-full flex flex-col justify-end items-center group" title={describe(b)}>
              <span className="text-[10px] sm:text-xs font-mono tabular-nums text-ink-700 mb-0.5">{pctText(b.p)}</span>
              <div
                className="w-full max-w-[3rem] rounded-t transition-opacity group-hover:opacity-80"
                style={{ height: `${Math.max(2, (b.p / max) * 80)}%`, backgroundColor: FILL[b.side] }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-[2px] mt-1" aria-hidden="true">
          {buckets.map((b) => (
            <span key={b.key} className="flex-1 text-center text-[10px] sm:text-xs font-mono text-ink-500">
              {b.side === 'tie' ? 'Tie' : bandLabel(b.from, b.to)}
            </span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>Chance of each winning margin</caption>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key}>
              <th scope="row">{b.side === 'tie' ? 'Tie' : `${name(b)} by ${bandLabel(b.from, b.to)}`}</th>
              <td>{pctText(b.p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-ink-700 mt-3 max-w-prose" data-testid="nfl-likeliest-margins">
        {'Most likely exact margins: '}
        {top.map((t, i) => (
          <span key={t.margin}>
            {i > 0 && (i === top.length - 1 ? ' and ' : ', ')}
            <strong>{`${t.margin > 0 ? homeShort : awayShort} by ${Math.abs(t.margin)}`}</strong>
            {` (${(t.p * 100).toFixed(1)}%)`}
          </span>
        ))}
        . NFL scores come in 3s and 7s, so margins of 3, 7, 10 and 14 come up far more often than their neighbours.
      </p>
    </figure>
  );
}

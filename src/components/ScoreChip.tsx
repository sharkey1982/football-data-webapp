/**
 * The app's signature visual motif: a final score rendered like an old
 * digital scoreboard/teleprinter readout. Used consistently across the
 * dashboard, match explorer, and team explorer so a score always reads
 * the same way wherever it appears.
 */
export function ScoreChip({
  homeGoals,
  awayGoals,
  size = 'md',
}: {
  homeGoals: number;
  awayGoals: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'text-sm px-2 py-0.5',
    md: 'text-base px-3 py-1',
    lg: 'text-xl px-4 py-1.5',
  }[size];

  return (
    <span className={`scoreline inline-flex items-center gap-1.5 font-bold ${sizeClasses}`}>
      <span>{homeGoals}</span>
      <span className="text-chalk-300 opacity-60">&ndash;</span>
      <span>{awayGoals}</span>
    </span>
  );
}

/** Single-letter Win/Draw/Loss indicator chip, used in form strings. */
export function FormBadge({ result }: { result: 'W' | 'D' | 'L' }) {
  const styles = {
    W: 'bg-pitch-700 text-chalk-100',
    D: 'bg-chalk-300 text-ink-700',
    L: 'bg-loss-600 text-chalk-100',
  }[result];

  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-sm text-xs font-bold font-mono ${styles}`}
      title={result === 'W' ? 'Win' : result === 'D' ? 'Draw' : 'Loss'}
    >
      {result}
    </span>
  );
}

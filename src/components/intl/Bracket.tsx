// ============================================================================
// src/components/intl/Bracket.tsx
//
// A knockout bracket drawn from the games: rounds left to right (last 32 to
// the final), each round ordered so the two ties feeding a later tie sit
// beside it -- worked back from the final, so it needs no draw data. A replay
// shows as the deciding game. Scrolls sideways on a phone.
// ============================================================================

import { TeamLink } from './IntlBits';
import { bracketRounds, type IntlMatch } from '../../lib/intlStats';

const ROUND_NAME: Record<string, string> = { R32: 'Last 32', R16: 'Last 16', QF: 'Quarter-finals', SF: 'Semi-finals', F: 'Final' };
const winnerOf = (m: IntlMatch) => (m.home_score > m.away_score ? m.home_team : m.away_score > m.home_score ? m.away_team : m.shootout_winner);

function Side({ slug, name, score, won, pens }: { slug: string; name: string; score: number; won: boolean; pens: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 px-2 py-0.5 ${won ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
      <span className="truncate"><TeamLink slug={slug} name={name} /></span>
      <span className="font-mono tabular-nums text-xs">
        {score}
        {pens && <span className="text-[10px] text-pitch-700 ml-0.5">p</span>}
      </span>
    </div>
  );
}

export default function Bracket({ matches }: { matches: IntlMatch[] }) {
  const rounds = bracketRounds(matches);
  if (!rounds.length) return null;
  return (
    <div className="overflow-x-auto -mx-4 px-4 pb-2" data-testid="intl-bracket">
      <div className="grid gap-3 min-w-max" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(10.5rem, 1fr))` }}>
        {rounds.map((r) => (
          <div key={r.code} className="flex flex-col">
            <p className="text-[11px] uppercase tracking-wide text-ink-500 mb-1">{ROUND_NAME[r.code]}</p>
            <div className="flex flex-1 flex-col justify-around gap-2">
              {r.games.map((m) => {
                const w = winnerOf(m);
                return (
                  <div key={m.match_key} className={`rounded border bg-white text-sm ${r.code === 'F' ? 'border-amber-500 ring-1 ring-amber-400' : 'border-chalk-300'}`} title={`${m.match_date}${m.went_extra_time ? ', after extra time' : ''}`}>
                    <Side slug={m.home_slug} name={m.home_name} score={m.home_score} won={w === m.home_team} pens={m.shootout_winner === m.home_team} />
                    <div className="border-t border-chalk-200" />
                    <Side slug={m.away_slug} name={m.away_name} score={m.away_score} won={w === m.away_team} pens={m.shootout_winner === m.away_team} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink-500 mt-1">p: won on penalties. Scores include extra time; where a tie was replayed, the replay is shown.</p>
    </div>
  );
}

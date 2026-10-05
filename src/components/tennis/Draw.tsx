// ============================================================================
// src/components/tennis/Draw.tsx
//
// Phase 3, C1/C2: the draw rebuilt from results (last 16 for Grand Slams,
// Tour Finals and 1000s; last 8 otherwise) and each finalist's path to the
// final. Tap or hover a player to light up their route through the bracket.
// The bracket scrolls sideways inside its own box at phone width.
// ============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Draw as DrawData, FinalPath } from '../../lib/tennisEvents';
import { tennisPlayerPath } from '../../lib/tennisApi';
import { isUpset, scoreLabel, shortDate, type TennisMatch, type Tour } from '../../lib/tennisStats';
import { PlayerLink } from './TennisBits';

const BOX_H = 64;
const GAP = 8;

function Line({ name, slug, rank, won, active, onPick }: { name: string; slug: string; rank: number | null; won: boolean; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={onPick}
      className={`flex w-full items-center justify-between gap-2 px-2 text-left ${won ? 'font-semibold text-ink-900' : 'text-ink-700'} ${active ? 'bg-amber-400/60' : ''}`}
      aria-pressed={active}
      data-slug={slug}
    >
      <span className="truncate">{name}</span>
      {rank != null && <span className="font-mono text-[11px] text-ink-500">{rank}</span>}
    </button>
  );
}

function Box({ m, pick, picked }: { m: TennisMatch | null; pick: (slug: string) => void; picked: string | null }) {
  if (!m) return <div className="rounded border border-dashed border-chalk-300 text-xs text-ink-500 flex items-center justify-center" style={{ height: BOX_H }}>not in data</div>;
  const upset = isUpset(m);
  return (
    <div className={`rounded border bg-white text-xs flex flex-col justify-center ${picked && (picked === m.winner_slug || picked === m.loser_slug) ? 'border-amber-500 ring-1 ring-amber-500' : 'border-chalk-300'}`} style={{ height: BOX_H }}>
      <Line name={m.winner} slug={m.winner_slug} rank={m.w_rank} won active={picked === m.winner_slug} onPick={() => pick(m.winner_slug)} />
      <Line name={m.loser} slug={m.loser_slug} rank={m.l_rank} won={false} active={picked === m.loser_slug} onPick={() => pick(m.loser_slug)} />
      <div className="px-2 font-mono text-[11px] text-ink-500 flex justify-between">
        <span>{scoreLabel(m)}</span>
        {upset && <span className="text-loss-700 font-sans font-semibold">Upset</span>}
      </div>
    </div>
  );
}

export function DrawView({ draw, tour }: { draw: DrawData; tour: Tour }) {
  const [picked, setPicked] = useState<string | null>(null);
  const first = draw.slots[0].length;
  const height = first * (BOX_H + GAP);
  return (
    <div className="space-y-2" data-testid="tennis-draw">
      <div className="overflow-x-auto pb-2">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${draw.rounds.length}, minmax(11rem, 1fr))`, minWidth: `${draw.rounds.length * 11.75}rem` }}>
          {draw.rounds.map((r) => (
            <div key={r} className="text-xs font-mono uppercase tracking-wide text-ink-500">{r}</div>
          ))}
          {draw.slots.map((col, ci) => (
            <div key={ci} className="flex flex-col justify-around" style={{ height }}>
              {col.map((m, i) => (
                <Box key={m?.source_key ?? `gap-${ci}-${i}`} m={m} pick={(s) => setPicked((p) => (p === s ? p : s))} picked={picked} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-ink-500">
        Winner first, ranking at the match on the right. Tap a player to follow their route
        {picked ? (
          <>
            {' '}(<Link to={tennisPlayerPath(tour, picked)} className="underline">open their page</Link>,{' '}
            <button type="button" className="underline" onClick={() => setPicked(null)}>clear</button>)
          </>
        ) : null}
        .{draw.gaps > 0 ? ` ${draw.gaps} box${draw.gaps === 1 ? '' : 'es'} empty: a bye or a match missing from the source.` : ''}
      </p>
    </div>
  );
}

export function PathsView({ paths, tour }: { paths: FinalPath[]; tour: Tour }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="tennis-paths">
      {paths.map((p) => (
        <div key={p.slug} className="border border-chalk-300 rounded-lg bg-white p-3 space-y-2">
          <p className="text-sm">
            <span className="font-semibold text-ink-900"><PlayerLink tour={tour} slug={p.slug} name={p.name} /></span>
            <span className="text-ink-500">{p.champion ? ' · champion' : ' · runner-up'}</span>
          </p>
          <ol className="space-y-1 text-xs">
            {p.steps.map((s) => (
              <li key={s.match.source_key} className="grid grid-cols-[5.5rem_1fr_auto] gap-2 items-baseline">
                <span className="font-mono text-ink-500">{s.match.round.replace('The Final', 'Final')}</span>
                <span className={s.won ? 'text-ink-900' : 'text-loss-700'}>
                  {s.won ? 'beat ' : 'lost to '}
                  <PlayerLink tour={tour} slug={s.opponentSlug} name={s.opponent} rank={s.opponentRank} />
                </span>
                <span className="font-mono text-ink-500 whitespace-nowrap">
                  {scoreLabel(s.match)}
                  {s.odds != null ? ` @ ${s.odds.toFixed(2)}` : ''}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink-700">
            {p.avgOpponentRank != null ? `Opponents' average ranking ${p.avgOpponentRank}; ${p.topOpponents} in the top 32.` : 'No opponent rankings recorded.'}
            {` ${shortDate(p.steps[0].match.match_date)} – ${shortDate(p.steps[p.steps.length - 1].match.match_date)}.`}
          </p>
        </div>
      ))}
    </div>
  );
}

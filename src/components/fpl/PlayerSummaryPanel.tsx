// ============================================================================
// src/components/fpl/PlayerSummaryPanel.tsx
//
// The summary at the top of a player's page. What the page already has
// (position, club, price, the next gameweek's minutes and start chance) is
// shown at once -- including in the pre-rendered HTML. Price pressure,
// ownership movement, set-piece duties and fitness come from getPlayerContext
// and fill in when loaded; each is independent, and a tile whose source
// fails simply isn't shown.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPlayerContext, type PlayerContext, type PlayerPageGameweek, type PlayerPageProfile } from '../../lib/fplPlayerPageApi';

const STATUS: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' }> = {
  a: { label: 'Available', tone: 'good' },
  d: { label: 'Doubtful', tone: 'warn' },
  i: { label: 'Injured', tone: 'bad' },
  s: { label: 'Suspended', tone: 'bad' },
  u: { label: 'Unavailable', tone: 'bad' },
  n: { label: 'Not in squad', tone: 'warn' },
};

/** The set_piece_type codes get_set_piece_takers actually returns (checked
 * live), in plain words; anything new falls back to a tidied code. */
const SET_PIECE_NAME: Record<string, string> = {
  penalty: 'Penalties',
  direct_free_kick: 'Direct free kicks',
  indirect_free_kick: 'Indirect free kicks',
  corner_left: 'Corners (left)',
  corner_right: 'Corners (right)',
};
export function setPieceLabel(type: string): string {
  if (SET_PIECE_NAME[type]) return SET_PIECE_NAME[type];
  const t = type.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th'];

/** Tactical role codes as stored on projections, in plain words. */
export const ROLE_NAME: Record<string, string> = {
  GK: 'Goalkeeper', CB: 'Centre-back', LCB: 'Left centre-back', RCB: 'Right centre-back', LB: 'Left-back', RB: 'Right-back',
  LWB: 'Left wing-back', RWB: 'Right wing-back', DM: 'Defensive midfielder', CM: 'Central midfielder', AM: 'Attacking midfielder',
  LW: 'Left winger', RW: 'Right winger', CF: 'Centre-forward', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward',
};

function Tile({ label, children, to }: { label: string; children: React.ReactNode; to?: string }) {
  return (
    <div className="rounded-lg border border-chalk-300 bg-white px-3 py-2 min-w-0">
      <p className="text-[10px] font-mono uppercase tracking-widest text-ink-500">{label}</p>
      <div className="text-sm text-ink-900 mt-0.5">{children}</div>
      {to && <Link to={to} className="text-[11px] text-pitch-800 underline underline-offset-2">More &rarr;</Link>}
    </div>
  );
}

export default function PlayerSummaryPanel({ profile, season }: { profile: PlayerPageProfile; season: PlayerPageGameweek[] }) {
  const [ctx, setCtx] = useState<PlayerContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPlayerContext(profile)
      .then((c) => { if (!cancelled) setCtx(c); })
      .catch(() => { if (!cancelled) setCtx(null); });
    return () => { cancelled = true; };
  }, [profile]);

  const next = season.find((g) => g.status !== 'played' && g.projected_points != null) ?? null;
  const tone = { good: 'text-pitch-800', warn: 'text-amber-600', bad: 'text-loss-700' };

  return (
    <section aria-label="Player summary" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Tile label="Position">{profile.position_label} &middot; {profile.team_name}</Tile>

      <Tile label="Price">
        {profile.price != null ? <>&pound;{profile.price.toFixed(1)}m</> : '\u2014'}
        {ctx?.market && ctx.market.price_change !== 0 && (
          <span className={ctx.market.price_change > 0 ? 'text-pitch-800' : 'text-loss-700'}>
            {' '}({ctx.market.price_change > 0 ? '+' : ''}&pound;{ctx.market.price_change.toFixed(1)}m in 7 days)
          </span>
        )}
      </Tile>

      {next && (
        <Tile label={`Gameweek ${next.matchweek}`}>
          {/* start_probability is stored 0-1 (checked: 0.000-0.960 across every projection) */}
          {next.start_probability != null && <>{Math.round(next.start_probability * 100)}% to start &middot; </>}
          {next.expected_minutes != null && <>{Math.round(next.expected_minutes)} mins expected</>}
          {next.tactical_role && <span className="block text-xs text-ink-500">Expected role: {ROLE_NAME[next.tactical_role] ?? next.tactical_role}</span>}
        </Tile>
      )}

      {ctx?.market && (
        <Tile label="Ownership" to="/fpl/in-the-papers">
          {ctx.market.ownership_now.toFixed(1)}%
          {Math.abs(ctx.market.ownership_change) >= 0.05 && (
            <span className={ctx.market.ownership_change > 0 ? 'text-pitch-800' : 'text-loss-700'}>
              {' '}{ctx.market.ownership_change > 0 ? '\u25b2' : '\u25bc'} {Math.abs(ctx.market.ownership_change).toFixed(1)} in 7 days
            </span>
          )}
        </Tile>
      )}

      {ctx?.priceRisk && (
        <Tile label="Price pressure" to="/fpl/price-risk">
          {ctx.priceRisk.direction === 'rise' && <span className="text-pitch-800">Under pressure to rise</span>}
          {ctx.priceRisk.direction === 'fall' && <span className="text-loss-700">Under pressure to fall</span>}
          {ctx.priceRisk.direction !== 'rise' && ctx.priceRisk.direction !== 'fall' && <span className="text-ink-700">No significant pressure</span>}
          {ctx.priceRisk.net_transfers !== 0 && (
            <span className="block text-xs text-ink-500">
              {ctx.priceRisk.net_transfers > 0 ? '+' : ''}{Math.round(ctx.priceRisk.net_transfers).toLocaleString('en-GB')} net transfers
            </span>
          )}
        </Tile>
      )}

      {ctx?.setPieces && (
        <Tile label="Set pieces" to="/fpl/set-pieces">
          {ctx.setPieces.length === 0 ? (
            <span className="text-ink-700">No set-piece duties</span>
          ) : (
            <ul className="space-y-0.5">
              {ctx.setPieces.map((s) => (
                <li key={s.type}>{setPieceLabel(s.type)}: <span className="font-mono text-xs">{ORDINAL[s.rank] ?? `${s.rank}th`} choice</span></li>
              ))}
            </ul>
          )}
        </Tile>
      )}

      {ctx?.fitness && (
        <Tile label="Fitness" to={ctx.fitness.status !== 'a' ? '/fpl/injuries' : undefined}>
          <span className={tone[STATUS[ctx.fitness.status]?.tone ?? 'warn']}>
            {STATUS[ctx.fitness.status]?.label ?? ctx.fitness.status}
            {ctx.fitness.chance_next_round != null && ctx.fitness.status !== 'a' && <> ({ctx.fitness.chance_next_round}% chance)</>}
          </span>
          {ctx.fitness.news && <span className="block text-xs text-ink-500">{ctx.fitness.news}</span>}
        </Tile>
      )}
    </section>
  );
}

// ============================================================================
// src/lib/todayFpl.ts
//
// "FPL today" on the Today page: the lines it shows, from the loaders the FPL
// pages already use -- the gameweek state (fplGameweekState), the next
// deadline (hubApi), FPL's price predictor and last night's changes
// (priceRiskApi: get_price_change_risk / get_price_changes_recent), the team
// news facts (get_day_page) and, for a remembered FPL ID, the squad's
// injury flags (fpl_live_entry picks against get_injury_report). Pure
// helpers below the loader, tested on their own.
// ============================================================================

import { getOpenGameweek, type OpenGameweek } from './fplGameweekState';
import { getNextDeadline } from './hubApi';
import { getPriceChangeRisk, getRecentPriceChanges, type PriceChange, type PriceRisk } from './priceRiskApi';
import { getInjuryReport, STATUS_LABEL, type InjuryRow } from './injuryApi';
import { fetchFplLive } from './fplLiveApi';
import { ukDateOf } from './ukDate';
import { ukTime, type TeamNewsSlot } from './todayApi';

export type FplToday = {
  open: OpenGameweek | null;
  next: { gw: number; deadline: string } | null;
  risk: PriceRisk[] | null;
  changes: PriceChange[] | null;
};

export async function getFplToday(): Promise<FplToday> {
  const [open, next, risk, changes] = await Promise.all([
    getOpenGameweek().catch(() => null),
    getNextDeadline().catch(() => null),
    getPriceChangeRisk().catch(() => null),
    getRecentPriceChanges(1).catch(() => null),
  ]);
  return { open, next, risk, changes };
}

/** A gameweek is on: its deadline has passed and a game is still to finish. */
export function liveGameweek(open: OpenGameweek | null): number | null {
  return open && open.state.showToggle && open.state.gamesRemaining > 0 ? open.state.openGw : null;
}

const price = (p: number) => `£${p.toFixed(1)}m`;

/** "Gameweek 9 · deadline passed 11:00", "Gameweek 10 deadline today, 18:30",
 *  "Gameweek 10 deadline: Friday 6 November, 18:30". */
export function deadlineLine(f: Pick<FplToday, 'open' | 'next'>, day: string, formatDeadline: (iso: string) => string): string | null {
  const live = liveGameweek(f.open);
  const nextToday = f.next && ukDateOf(f.next.deadline) === day;
  if (f.next && nextToday) return `Gameweek ${f.next.gw} deadline today, ${ukTime(f.next.deadline)}`;
  if (live != null) return `Gameweek ${live} is on${f.next ? `. Gameweek ${f.next.gw} deadline: ${formatDeadline(f.next.deadline)}` : ''}`;
  if (f.next) return `Gameweek ${f.next.gw} deadline: ${formatDeadline(f.next.deadline)}`;
  return null;
}

/** Most bought and most sold since the deadline (FPL's event transfers). */
export function mostTransferred(risk: PriceRisk[] | null): { inName: string; inCount: number; outName: string; outCount: number } | null {
  if (!risk || risk.length === 0) return null;
  const bought = [...risk].sort((a, b) => b.transfers_in - a.transfers_in)[0];
  const sold = [...risk].sort((a, b) => b.transfers_out - a.transfers_out)[0];
  if (!bought.transfers_in && !sold.transfers_out) return null;
  return { inName: bought.web_name, inCount: bought.transfers_in, outName: sold.web_name, outCount: sold.transfers_out };
}

/** "1.97m", "820k", "4,210". */
export function count(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/0$/, '')}m`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString('en-GB');
}

/** "Up: Rogers £8.1m, Tavernier £6.5m. Down: Delap £5.4m." -- last night's
 *  changes, only when the night is the one just gone. */
export function overnightLine(changes: PriceChange[] | null, day: string): string | null {
  if (!changes || changes.length === 0) return null;
  const night = changes[0].night.slice(0, 10);
  const yesterday = new Date(Date.parse(`${day}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  if (night !== yesterday && night !== day) return null;
  const list = (xs: PriceChange[]) => xs.slice(0, 5).map((c) => `${c.web_name} ${price(c.price_after)}`).join(', ') + (xs.length > 5 ? ` and ${xs.length - 5} more` : '');
  const up = changes.filter((c) => c.price_after > c.price_before);
  const down = changes.filter((c) => c.price_after < c.price_before);
  return [up.length ? `Up: ${list(up)}.` : '', down.length ? `Down: ${list(down)}.` : ''].filter(Boolean).join(' ') || null;
}

/** Tonight: the players past FPL's line (its predictor at 100%+). */
export function tonightLine(risk: PriceRisk[] | null): string | null {
  if (!risk) return null;
  const expected = risk.filter((r) => r.outlook === 'expected');
  const checked = risk.map((r) => r.updated_at).filter((t): t is string => !!t).sort().pop();
  const at = checked ? ` (checked ${ukTime(checked)})` : '';
  if (expected.length === 0) return `Tonight: nobody past FPL’s line yet${at}.`;
  const rise = expected.filter((r) => r.direction === 'rise').map((r) => r.web_name);
  const fall = expected.filter((r) => r.direction === 'fall').map((r) => r.web_name);
  const parts = [rise.length ? `${rise.slice(0, 5).join(', ')}${rise.length > 5 ? ` and ${rise.length - 5} more` : ''} to rise` : '', fall.length ? `${fall.slice(0, 5).join(', ')}${fall.length > 5 ? ` and ${fall.length - 5} more` : ''} to fall` : ''].filter(Boolean);
  return `Tonight, FPL expects ${parts.join('; ')}${at}.`;
}

const names = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** One team-news line per Premier League kick-off slot. */
export function teamNewsLine(s: TeamNewsSlot): string {
  const time = ukTime(s.slot);
  const games = s.games.map((g) => `${g.home} v ${g.away}`).join(', ');
  if (!s.ready) return `${time} line-ups from about ${ukTime(Date.parse(s.slot) - 60 * 60_000)}.`;
  const lead = s.games.length === 1 ? `${games}:` : `${time} (${s.games.length} games):`;
  if (s.notStarting.length === 0) return `${lead} no player owned by 10%+ left out.`;
  return `${lead} ${names(s.notStarting.map((p) => `${p.name} (${p.team}, ${p.own}%)`))} not starting.`;
}

// ---- Your squad's flags -----------------------------------------------------------------

export type SquadFlag = { name: string; team: string | null; status: string; chance: number | null; news: string | null };

/** The picks of the remembered team that FPL has flagged. */
export function squadFlags(pickIds: number[], injuries: InjuryRow[]): SquadFlag[] {
  const ids = new Set(pickIds);
  return injuries
    .filter((r) => ids.has(r.fpl_player_id))
    .map((r) => ({ name: r.web_name, team: r.team_name, status: STATUS_LABEL[r.status] ?? r.status, chance: r.chance_next_round, news: r.news }));
}

export async function getSquadFlags(fplId: string): Promise<{ team: string; flags: SquadFlag[] }> {
  const [live, injuries] = await Promise.all([fetchFplLive(Number(fplId)), getInjuryReport()]);
  return { team: live.entry.name, flags: squadFlags(live.picks.map((p) => p.element), injuries) };
}

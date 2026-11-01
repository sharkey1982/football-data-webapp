// ============================================================================
// src/components/fpl/LivePitch.tsx
//
// The pitch view of /fpl/live (Chris, 1 Nov 2026, from a screenshot of the
// FPL app's Pick Team screen): the XI in formation rows (GKP, DEF, MID, FWD
// as picked, after automatic subs), the four bench players in a strip below
// labelled by position, and per player a plain kit-colour shirt with the
// club's short code, the name bar (tinted by FPL's availability flag) and
// either his live points this gameweek or, before kick-off, the opponent
// and venue ("HUL (H)"). Tapping a tile opens a panel with his news, chance
// of playing, live breakdown and FixtureShark's next-fixture projection.
//
// Shirts are two flat colours only (src/lib/fplLivePitch.ts KIT_COLOURS): no
// crests, sponsors, kit designs or league branding.
// ============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FplLiveData } from '../../lib/fplLiveApi';
import { fixtureState, type LiveTeamScore, type PlayerScore } from '../../lib/fplLiveScore';
import { AVAILABILITY_CLASSES, availabilityOf, benchLabelOf, kitFor, playStateOf, type PitchExtra, type PlayState } from '../../lib/fplLivePitch';

const POS: Record<number, string> = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const POS_WORD: Record<number, string> = { 1: 'goalkeeper', 2: 'defender', 3: 'midfielder', 4: 'forward' };
const STAT_LABEL: Record<string, string> = {
  minutes: 'Minutes played', goals_scored: 'Goals', assists: 'Assists', clean_sheets: 'Clean sheet',
  goals_conceded: 'Goals conceded', own_goals: 'Own goals', penalties_saved: 'Penalties saved',
  penalties_missed: 'Penalties missed', yellow_cards: 'Yellow cards', red_cards: 'Red cards', saves: 'Saves',
  bonus: 'Bonus', defensive_contribution: 'Defensive contribution', bps: 'BPS',
};

const newsDateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** "HUL (H)" for each of the player's fixtures this gameweek. */
function opponentsOf(p: PlayerScore, data: FplLiveData): string {
  const fx = data.fixtures.filter((f) => f.teamH === p.team || f.teamA === p.team);
  if (fx.length === 0) return 'No match';
  return fx.map((f) => {
    const home = f.teamH === p.team;
    return `${data.teams.get(home ? f.teamA : f.teamH)?.short ?? '?'} (${home ? 'H' : 'A'})`;
  }).join(', ');
}

function Shirt({ short, gk }: { short: string; gk: boolean }) {
  const kit = gk ? { primary: '#1f2937', secondary: '#facc15', text: '#facc15' } : kitFor(short);
  return (
    <svg viewBox="0 0 40 36" className="w-9 h-8 sm:w-11 sm:h-10 drop-shadow" aria-hidden="true" focusable="false">
      {/* Plain T-shirt silhouette: body, sleeves and collar in two flat colours. */}
      <path d="M13 2 L4 7 L1 15 L7 17 L9 13 L9 34 L31 34 L31 13 L33 17 L39 15 L36 7 L27 2 Q20 7 13 2 Z" fill={kit.primary} stroke="rgba(0,0,0,0.35)" strokeWidth="0.8" />
      <path d="M4 7 L1 15 L7 17 L9 13 Z M36 7 L39 15 L33 17 L31 13 Z" fill={kit.secondary} />
      <path d="M13 2 Q20 7 27 2" fill="none" stroke={kit.secondary} strokeWidth="2" />
      <text x="20" y="25" textAnchor="middle" fontSize="8.5" fontWeight="700" fontFamily="Inter, Arial, sans-serif" fill={kit.text}>{short}</text>
    </svg>
  );
}

function StateMarker({ state }: { state: PlayState }) {
  if (state === 'live') return <span className="absolute -right-1 bottom-0 w-2.5 h-2.5 rounded-full bg-amber-400 ring-1 ring-pitch-900 animate-pulse" title="Playing now" data-testid="state-live" />;
  if (state === 'done') return <span className="absolute -right-2 bottom-0 text-[9px] leading-none font-bold text-chalk-100 bg-pitch-950/70 rounded px-0.5" title="Match finished" data-testid="state-done">FT</span>;
  return null;
}

interface TileProps {
  p: PlayerScore;
  data: FplLiveData;
  extra?: PitchExtra;
  benchLabel?: string;
  selected: boolean;
  onSelect: (id: number) => void;
}

function PlayerTile({ p, data, extra, benchLabel, selected, onSelect }: TileProps) {
  const short = data.teams.get(p.team)?.short ?? '';
  const club = data.teams.get(p.team)?.name ?? short;
  const avail = extra?.availability ?? availabilityOf(null);
  const cls = AVAILABILITY_CLASSES[avail.tone];
  const state = playStateOf(p);
  const showPoints = state === 'live' || state === 'done';
  const counted = p.multiplier > 0;
  const shownPoints = counted ? p.points * p.multiplier : p.points;
  const value = showPoints ? fmt(shownPoints) : opponentsOf(p, data);
  const armband = p.isCaptain ? (p.multiplier === 3 ? 'TC' : 'C') : p.isViceCaptain ? 'V' : null;

  const aria = [
    p.webName,
    club,
    POS_WORD[p.type] ?? '',
    avail.tone !== 'none' ? avail.label.toLowerCase() : null,
    armband === 'C' ? 'captain' : armband === 'TC' ? 'triple captain' : armband === 'V' ? 'vice-captain' : null,
    showPoints ? `${fmt(shownPoints)} point${shownPoints === 1 ? '' : 's'}` : `next ${value}`,
    state === 'live' ? 'playing now' : null,
    p.subbedIn ? 'automatic sub on' : p.subbedOut ? 'automatic sub off' : null,
  ].filter(Boolean).join(', ');

  return (
    <li className="flex-1 min-w-0 max-w-[5.5rem] flex flex-col items-center" data-testid={`pitch-player-${p.element}`}>
      {benchLabel && <span className="text-[10px] font-mono uppercase tracking-wide text-ink-700 mb-0.5">{benchLabel}</span>}
      <button
        type="button"
        onClick={() => onSelect(p.element)}
        aria-label={aria}
        aria-pressed={selected}
        className={`relative w-full min-h-[44px] flex flex-col items-center rounded-md pt-1 ${selected ? 'ring-2 ring-amber-400' : ''} ${counted ? '' : 'opacity-90'}`}
      >
        {avail.tone !== 'none' && (
          <span
            className={`absolute left-0.5 top-0.5 z-10 w-4 h-4 rounded-sm text-[10px] font-bold leading-4 text-center ${cls.flag}`}
            data-testid={`flag-${p.element}`}
            data-tone={avail.tone}
            aria-hidden="true"
          >
            !
          </span>
        )}
        {armband && (
          <span
            className={`absolute right-0.5 top-0.5 z-10 min-w-4 h-4 px-0.5 rounded-full text-[9px] font-bold leading-4 text-center ${armband === 'V' ? 'bg-chalk-100 text-ink-900 ring-1 ring-ink-700' : 'bg-ink-900 text-chalk-100'}`}
            aria-hidden="true"
          >
            {armband}
          </span>
        )}
        <span className="relative">
          <Shirt short={short} gk={p.type === 1} />
          <StateMarker state={state} />
          {(p.subbedIn || p.subbedOut) && (
              <span
                className={`absolute -left-2 bottom-0 z-10 text-[10px] font-bold leading-none rounded px-0.5 ${p.subbedIn ? 'bg-pitch-600 text-chalk-100' : 'bg-loss-600 text-chalk-100'}`}
                title={p.subbedIn ? 'Automatic sub: on' : 'Automatic sub: off'}
                aria-hidden="true"
              >
                {p.subbedIn ? '↑' : '↓'}
              </span>
            )}
        </span>
        <span className={`mt-0.5 w-full truncate text-[11px] sm:text-xs font-semibold leading-tight px-0.5 rounded-t-sm ${cls.bar}`} data-testid={`namebar-${p.element}`}>
          {p.webName}
        </span>
        <span className={`w-full truncate text-[11px] sm:text-xs leading-tight px-0.5 rounded-b-sm tabular-nums ${showPoints ? 'bg-pitch-950 text-chalk-100 font-bold' : 'bg-pitch-950/80 text-chalk-100'}`}>
          {value}
        </span>
      </button>
    </li>
  );
}

function DetailPanel({ p, data, extra, slug, onClose }: { p: PlayerScore; data: FplLiveData; extra?: PitchExtra; slug: string | null; onClose: () => void }) {
  const team = data.teams.get(p.team);
  const avail = extra?.availability ?? availabilityOf(null);
  const state = playStateOf(p);
  const counted = p.multiplier > 0;
  const next = extra?.next ?? null;
  const gwProj = [...(data.projections.get(p.element)?.values() ?? [])].reduce((a, b) => a + b, 0);
  const newsAdded = extra?.newsAdded ? new Date(extra.newsAdded) : null;
  return (
    <section
      className="border border-chalk-300 rounded-lg bg-white px-3 py-3 text-sm space-y-2"
      aria-live="polite"
      aria-label={`${p.webName} details`}
      data-testid="pitch-detail"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink-900">{extra?.fullName || p.webName}</p>
          <p className="text-xs text-ink-500">{team?.name ?? ''} · {POS_WORD[p.type] ?? ''}{p.isCaptain ? ' · captain' : p.isViceCaptain ? ' · vice-captain' : ''}</p>
        </div>
        <button type="button" onClick={onClose} className="min-w-[44px] min-h-[44px] -m-2 text-ink-500 hover:text-ink-900" aria-label="Close player details">&times;</button>
      </div>

      <div>
        {avail.tone === 'none' ? (
          <p className="text-ink-700">{extra ? 'No fitness or availability news.' : 'Availability not loaded.'}</p>
        ) : (
          <p>
            <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${AVAILABILITY_CLASSES[avail.tone].bar}`}>{avail.label}</span>
            {extra?.chanceNext != null && <span className="ml-2 text-ink-700">{extra.chanceNext}% chance of playing next round</span>}
            {extra?.chanceNext == null && extra?.chanceThis != null && <span className="ml-2 text-ink-700">{extra.chanceThis}% chance of playing this round</span>}
          </p>
        )}
        {extra?.news && (
          <p className="mt-1 text-ink-700">
            {extra.news}
            {newsAdded && !Number.isNaN(newsAdded.getTime()) && <span className="block text-xs text-ink-500">News added {newsDateFmt.format(newsAdded)}</span>}
          </p>
        )}
      </div>

      {(state === 'live' || state === 'done') && (
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-ink-500">{`GW${data.event.id}`} {state === 'live' ? 'so far' : ''}</p>
          <table className="w-full text-xs mt-1">
            <tbody>
              {p.fixtures.flatMap((f) => {
                const fx = data.fixtures.find((x) => x.id === f.fixtureId);
                const home = fx ? fx.teamH === p.team : true;
                const opp = fx ? data.teams.get(home ? fx.teamA : fx.teamH)?.short ?? '' : '';
                const rows = f.stats.filter((s) => s.identifier !== 'bonus' && (s.points !== 0 || s.identifier === 'minutes'));
                return [
                  <tr key={`h${f.fixtureId}`}><th scope="rowgroup" colSpan={3} className="text-left font-medium text-ink-700 pt-1">{`v ${opp} (${home ? 'H' : 'A'})`}{fx && fixtureState(fx) === 'live' ? ` · ${fx.minutes}′` : ''}</th></tr>,
                  ...rows.map((s) => (
                    <tr key={`${f.fixtureId}-${s.identifier}`}>
                      <td className="text-ink-700">{STAT_LABEL[s.identifier] ?? s.identifier}</td>
                      <td className="text-right font-mono tabular-nums text-ink-500">{s.value}</td>
                      <td className="text-right font-mono tabular-nums w-10">{s.points}</td>
                    </tr>
                  )),
                  ...(f.bonus > 0 ? [
                    <tr key={`${f.fixtureId}-bonus`}>
                      <td className="text-ink-700">Bonus{f.bonusState !== 'confirmed' ? ' (as it stands)' : ''}</td>
                      <td />
                      <td className="text-right font-mono tabular-nums w-10">{f.bonus}</td>
                    </tr>,
                  ] : []),
                ];
              })}
              <tr className="border-t border-chalk-300">
                <td className="font-semibold text-ink-900 pt-1">Total{p.multiplier >= 2 ? ` (×${p.multiplier})` : ''}</td>
                <td className="text-right font-mono tabular-nums text-ink-500 pt-1">{`${p.minutes}′`}</td>
                <td className="text-right font-mono tabular-nums font-semibold pt-1">{fmt(counted ? p.points * p.multiplier : p.points)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {state === 'to_come' && gwProj > 0 && (
        <p className="text-ink-700">{`Projected for GW${data.event.id}: `}<span className="font-mono tabular-nums">{gwProj.toFixed(1)}</span> pts (deadline projection)</p>
      )}

      {next && (next.xp != null || next.startProbability != null) && (
        <p className="text-ink-700" data-testid="pitch-detail-next">
          Next: {next.opponent ?? '?'} ({next.home ? 'H' : 'A'})
          {next.matchweek ? `, GW${next.matchweek}` : ''}
          {next.kickoffDate ? `, ${dayFmt.format(new Date(`${next.kickoffDate}T12:00:00Z`))}` : ''}.{' '}
          {next.xp != null && <>Projected <span className="font-mono tabular-nums">{next.xp.toFixed(1)}</span> pts</>}
          {next.xp != null && next.startProbability != null ? ', ' : ''}
          {next.startProbability != null && <>{Math.round(next.startProbability * 100)}% to start</>}.
        </p>
      )}

      {slug && (
        <p>
          <Link to={`/fpl/players/${slug}`} className="text-pitch-800 underline underline-offset-2">{p.webName}&rsquo;s player page</Link>
        </p>
      )}
    </section>
  );
}

export function LivePitch({ score, data, extras }: { score: LiveTeamScore; data: FplLiveData; extras: Map<number, PitchExtra> | null }) {
  const [selected, setSelected] = useState<number | null>(null);
  const byPos = [...score.players].sort((a, b) => a.position - b.position);
  const xi = byPos.filter((p) => p.position <= 11);
  const bench = byPos.filter((p) => p.position > 11);
  const rows = [1, 2, 3, 4].map((t) => xi.filter((p) => p.type === t)).filter((r) => r.length > 0);
  const sel = selected == null ? null : score.players.find((p) => p.element === selected) ?? null;
  const slugOf = (id: number) => data.players.find((p) => p.id === id)?.slug ?? null;

  const tile = (p: PlayerScore, benchLabel?: string) => (
    <PlayerTile
      key={p.element}
      p={p}
      data={data}
      extra={extras?.get(p.element)}
      benchLabel={benchLabel}
      selected={selected === p.element}
      onSelect={setSelected}
    />
  );

  return (
    <div className="space-y-3">
      <div
        className="relative rounded-lg overflow-hidden px-1 sm:px-3 py-3"
        style={{ background: 'repeating-linear-gradient(180deg, #2f7d4a 0 44px, #2a7243 44px 88px)' }}
        data-testid="live-pitch"
      >
        {/* Pitch markings: halfway line, centre circle, both boxes. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-2 border-2 border-white/30 rounded-sm" />
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 w-2/5 h-14 border-2 border-t-0 border-white/30" />
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 bottom-2 -translate-x-1/2 w-2/5 h-14 border-2 border-b-0 border-white/30" />
        <div aria-hidden="true" className="pointer-events-none absolute left-2 right-2 top-[55%] border-t-2 border-white/30" />
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border-2 border-white/30" />
        <div className="relative space-y-3 sm:space-y-5">
          {rows.map((r) => (
            <ul key={r[0].type} className="flex justify-center gap-1 sm:gap-3" data-testid={`pitch-row-${POS[r[0].type]}`} aria-label={`${POS_WORD[r[0].type]}s`}>
              {r.map((p) => tile(p))}
            </ul>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-pitch-800/10 border border-chalk-300 px-1 sm:px-3 py-2">
        <p className="sr-only">Bench</p>
        <ul className="flex justify-center gap-1 sm:gap-3" data-testid="pitch-bench" aria-label="Bench">
          {bench.map((p) => tile(p, benchLabelOf(p)))}
        </ul>
      </div>

      <p className="text-xs text-ink-500 flex flex-wrap gap-x-3 gap-y-1" aria-hidden="true">
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-yellow-400 align-middle mr-1" />Doubtful (75%/50%)</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-500 align-middle mr-1" />25%</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-600 align-middle mr-1" />Out</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 align-middle mr-1" />Playing now</span>
        <span><span className="font-bold font-mono mr-1">FT</span>Finished</span>
        <span>Tap a player for news and the breakdown</span>
      </p>

      {sel && <DetailPanel p={sel} data={data} extra={extras?.get(sel.element)} slug={slugOf(sel.element)} onClose={() => setSelected(null)} />}
    </div>
  );
}

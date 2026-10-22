// FPL Live (/fpl/live): one team's gameweek from public.fpl_live_entry.
// The database fetches the manager's picks from FPL once per gameweek and
// keeps the live feed fresh every minute while matches are on; scoring is
// done here, in src/lib/fplLiveScore.ts.

import { supabase } from './supabase';
import {
  deadlineLineup,
  fixtureState,
  type AutoSubRaw,
  type ElementValue,
  type FplPickRaw,
  type LiveExplain,
  type LiveFixture,
  type LivePlayer,
  type LiveScoreInput,
} from './fplLiveScore';

export interface FplLiveData {
  entry: { id: number; name: string; playerName: string };
  event: { id: number; name: string; deadline: string | null; finished: boolean; isCurrent: boolean; currentEvent: number };
  chip: string | null;
  transferCost: number;
  picks: FplPickRaw[];
  autoSubs: AutoSubRaw[];
  players: (LivePlayer & { slug: string | null })[];
  teams: Map<number, { short: string; name: string }>;
  fixtures: LiveFixture[];
  projections: Map<number, Map<number, number>>;
  projectionModel: string | null;
  liveUpdatedAt: string | null;
}

export class FplLiveError extends Error {
  readonly status: string;
  constructor(message: string, status: string) {
    super(message);
    this.status = status;
  }
}

const MESSAGES: Record<string, string> = {
  bad_id: 'That doesn’t look like an FPL ID: it’s a number of up to 8 digits.',
  not_found: 'There’s no FPL team with that ID.',
  busy: 'Lots of teams are being looked up right now. Try again in a minute.',
  unavailable: 'FPL isn’t answering right now (it often isn’t while it updates, around deadlines and after the last match). Try again shortly.',
  not_started: 'The FPL season hasn’t started yet.',
  bad_event: 'That gameweek hasn’t started yet.',
};

type Raw = {
  status: string;
  current_event?: number;
  event?: number | { id: number; name: string; deadline: string | null; finished: boolean; is_current: boolean; current_event: number };
  entry?: { id: number; name: string; player_name?: string };
  picks?: { active_chip: string | null; event_transfers_cost: number; automatic_subs: AutoSubRaw[]; picks: FplPickRaw[] };
  players?: { id: number; web_name: string; slug: string | null; team: number; type: number; minutes: number; explain: LiveExplain[] }[];
  teams?: { id: number; short_name: string; name: string }[];
  fixtures?: {
    id: number; team_h: number; team_a: number; kickoff_time: string | null; started: boolean;
    finished_provisional: boolean; finished: boolean; minutes: number; team_h_score: number | null;
    team_a_score: number | null; bps: ElementValue[]; bonus: ElementValue[];
  }[];
  projections?: { element: number; fixture: number; xp: number }[];
  projection_model?: string | null;
  live_updated_at?: string | null;
};

export function parseFplLive(raw: Raw): FplLiveData {
  if (raw.status === 'no_picks') {
    const ev = typeof raw.event === 'number' ? raw.event : raw.event?.id;
    throw new FplLiveError(`${raw.entry?.name ?? 'That team'} has no picks for gameweek ${ev}: it joined later.`, raw.status);
  }
  if (raw.status !== 'ok' || !raw.entry || !raw.picks || typeof raw.event !== 'object' || !raw.event) {
    throw new FplLiveError(MESSAGES[raw.status] ?? 'Something went wrong. Try again.', raw.status);
  }
  const projections = new Map<number, Map<number, number>>();
  for (const p of raw.projections ?? []) {
    if (!projections.has(p.element)) projections.set(p.element, new Map());
    projections.get(p.element)!.set(p.fixture, Number(p.xp));
  }
  return {
    entry: { id: raw.entry.id, name: raw.entry.name, playerName: raw.entry.player_name ?? '' },
    event: {
      id: raw.event.id,
      name: raw.event.name,
      deadline: raw.event.deadline,
      finished: raw.event.finished,
      isCurrent: raw.event.is_current,
      currentEvent: raw.event.current_event,
    },
    chip: raw.picks.active_chip ?? null,
    transferCost: raw.picks.event_transfers_cost ?? 0,
    picks: raw.picks.picks ?? [],
    autoSubs: raw.picks.automatic_subs ?? [],
    players: (raw.players ?? []).map((p) => ({
      id: p.id, webName: p.web_name, slug: p.slug, team: p.team, type: p.type, minutes: p.minutes ?? 0, explain: p.explain ?? [],
    })),
    teams: new Map((raw.teams ?? []).map((t) => [t.id, { short: t.short_name, name: t.name }])),
    fixtures: (raw.fixtures ?? []).map((f) => ({
      id: f.id, teamH: f.team_h, teamA: f.team_a, kickoff: f.kickoff_time, started: !!f.started,
      finishedProvisional: !!f.finished_provisional, finished: !!f.finished, minutes: f.minutes ?? 0,
      scoreH: f.team_h_score, scoreA: f.team_a_score, bps: f.bps ?? [], bonus: f.bonus ?? [],
    })),
    projections,
    projectionModel: raw.projection_model ?? null,
    liveUpdatedAt: raw.live_updated_at ?? null,
  };
}

export async function fetchFplLive(entryId: number, event?: number): Promise<FplLiveData> {
  const { data, error } = await supabase.rpc('fpl_live_entry', event ? { p_entry_id: entryId, p_event_id: event } : { p_entry_id: entryId });
  if (error) throw new FplLiveError('Couldn’t reach the server just now. Try again in a minute.', 'error');
  return parseFplLive(data as unknown as Raw);
}

export function toScoreInput(d: FplLiveData): LiveScoreInput {
  return {
    picks: deadlineLineup(d.picks, d.autoSubs),
    chip: d.chip,
    transferCost: d.transferCost,
    players: d.players,
    fixtures: d.fixtures,
    projections: d.projections,
  };
}

/**
 * Whether the page should keep polling: a match is in play, or one kicks off
 * within 10 minutes, or one has ended and FPL hasn't confirmed its bonus yet.
 */
export function shouldPoll(fixtures: LiveFixture[], now: number = Date.now()): boolean {
  return fixtures.some((f) => {
    const state = fixtureState(f);
    if (state === 'live') return true;
    if (state === 'done') return !f.finished;
    const ko = f.kickoff ? Date.parse(f.kickoff) : NaN;
    return Number.isFinite(ko) && ko - now <= 10 * 60_000 && now - ko <= 3 * 3600_000;
  });
}

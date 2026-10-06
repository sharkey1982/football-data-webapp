// ============================================================================
// src/lib/tennisWatch.ts
//
// The tennis TV guide in the shared WatchGuideView's shape (Chris, 6 Oct 2026:
// keep the TV guides consistent across sports). One row per tournament, on
// the day it starts (or today, "On now", while it's being played), with the
// UK channel from tennis.broadcasters as a viewing route. The source has no
// match times, so the time column says "On now" or "Usually" instead.
// ============================================================================

import type { WatchGuideItem } from '../components/WatchGuideView';
import { tennisEditionPath, tennisEventPath } from './tennisApi';
import { countryName, guideGroups, type CalendarRow, type TennisEdition } from './tennisEvents';
import { LEVEL_LABEL, shortDate, type Level, type Tour } from './tennisStats';
import type { WatchOffer } from './watchGuide';

const SOURCE_URL = 'https://en.wikipedia.org/wiki/Sports_broadcasting_contracts_in_the_United_Kingdom';
let nextId = -1;

function offer(channel: string, free: boolean, notes: string | null): WatchOffer {
  const broadcaster = channel.startsWith('Sky') ? 'Sky Sports' : channel.startsWith('TNT') ? 'TNT Sports' : channel.startsWith('BBC') ? 'BBC' : channel;
  return {
    broadcastId: nextId--,
    status: 'confirmed_broadcast',
    broadcaster,
    channel,
    streamingService: null,
    serviceProduct: null,
    accessType: free ? 'free' : 'subscription',
    deliveryMethods: [],
    platformDevice: null,
    isFast: false,
    isFreeToAir: free,
    isSubscription: !free,
    isPpv: false,
    watchUrl: null,
    confidence: 'rule',
    availabilityNotes: notes,
    source: 'rule:tennis_uk_rights',
    sourceUrl: SOURCE_URL,
    verifiedAt: null,
  };
}

/** The viewing routes for a tournament: the rights holder, plus free highlights where there are any. */
export function tennisOffers(channel: string | null, freeToAir: string | null): WatchOffer[] {
  if (!channel) return [];
  const free = channel === 'BBC';
  const out = [offer(free ? freeToAir ?? 'BBC' : channel, free, null)];
  if (!free && freeToAir) out.push(offer(freeToAir, true, 'Free-to-air highlights.'));
  return out;
}

const levelName = (tour: Tour, level: Level | null) =>
  level === 'Grand Slam' ? 'Grand Slam' : level === 'Finals' ? `${tour} Finals` : level ? `${tour} ${LEVEL_LABEL[level]}` : tour;

function base(tour: Tour, level: Level | null, levelRank: number) {
  const big = level === 'Grand Slam' || level === 'Finals';
  return {
    slug: null,
    kickoffTime: null,
    leagueCode: `${tour}-${level ?? ''}`,
    leagueName: levelName(tour, level),
    countryName: '',
    competitionType: big ? 'cup' : 'league',
    leagueTier: levelRank,
    awayTeamName: '',
    homeTeamCountry: null,
    awayTeamCountry: null,
    predictedHomeGoals: null,
    predictedAwayGoals: null,
  };
}

function fromCalendar(c: CalendarRow, today: string, onNow: boolean): WatchGuideItem {
  return {
    ...base(c.tour, c.level, c.level_rank),
    fixtureId: c.event_id,
    href: tennisEventPath(c.tour, c.slug),
    title: c.name,
    homeTeamName: c.name,
    kickoffDate: onNow ? today : c.usual_start,
    timeLabel: onNow ? 'On now' : 'Usually',
    subtitle: `${levelName(c.tour, c.level)} · ${[c.city, countryName(c.country)].filter(Boolean).join(', ')} · ${c.surface ?? ''} · usually ${shortDate(c.usual_start)} – ${shortDate(c.usual_end)}${c.last_winner ? ` · ${c.last_year} champion ${c.last_winner}` : ''}`,
    offers: tennisOffers(c.channel, c.free_to_air),
  };
}

function fromEdition(e: TennisEdition, today: string, cal: CalendarRow | undefined): WatchGuideItem {
  return {
    ...base(e.tour, e.level, e.level_rank),
    fixtureId: 1_000_000 + e.event_id,
    href: tennisEditionPath(e.tour, e.event_slug, e.year),
    title: e.name,
    homeTeamName: e.name,
    kickoffDate: today,
    timeLabel: 'On now',
    subtitle: `${levelName(e.tour, e.level)} · ${e.city ?? ''} · ${e.surface ?? ''} · started ${shortDate(e.start_date)} · results to ${shortDate(e.end_date)}`,
    offers: tennisOffers(cal?.channel ?? null, cal?.free_to_air ?? null),
  };
}

/** Under way, this week, next week and the six weeks after, as guide rows. */
export function tennisGuideItems(calendar: CalendarRow[], recent: TennisEdition[], today: string): WatchGuideItem[] {
  const g = guideGroups(calendar, recent, today);
  const byEvent = new Map(calendar.map((c) => [c.event_id, c]));
  return [
    ...g.underWay.map((e) => fromEdition(e, today, byEvent.get(e.event_id))),
    ...[...g.thisWeek, ...g.nextWeek, ...g.later].map((c) => fromCalendar(c, today, c.usual_start <= today && c.usual_end >= today)),
  ].sort((a, b) => a.kickoffDate.localeCompare(b.kickoffDate) || (a.leagueTier ?? 9) - (b.leagueTier ?? 9) || (a.title ?? '').localeCompare(b.title ?? ''));
}

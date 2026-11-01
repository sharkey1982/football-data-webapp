// ============================================================================
// src/lib/answerFirst.ts
//
// The plain, dated opening sentence and the "Common questions" for the main
// entity pages (team, match, FPL player), so a person, a search engine or an
// AI assistant can quote the page's answer directly (1 Nov 2026).
//
// Built ONLY from the data the page already has: each function returns
// nothing for a fact the data doesn't hold, never a guess. The same function
// feeds the visible text (the page component) and the FAQPage JSON-LD (the
// server renderer in entry-server.tsx), so the two cannot say different
// things. Model and market probabilities are stated as facts about the
// model and the market; there is no betting advice here.
// ============================================================================

import { formatMatchDateWithYear } from './formatDate';
import { hasKickedOff, isPostponed } from './fixtureStatus';
import { mostLikelyScore, type MatchPagePrediction } from './matchPageApi';
import type { FixtureBroadcast } from './broadcastsApi';
import type { TeamPageMatch, TeamPageProfile, TeamStanding } from './teamPageApi';
import type { PlayerPageGameweek, PlayerPageProfile } from './fplPlayerPageApi';

export type Faq = { q: string; a: string };
export type Answer = { lead: string | null; faqs: Faq[] };

// ---- Formatting -------------------------------------------------------------
// Fixed tables rather than Intl month names: en-GB gives "Sept" in some
// engines and "Sep" in others (see formatDate.ts).
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** '2026-11-01' -> '1 November 2026'; with weekday -> 'Sunday 1 November 2026'. */
export function longDate(iso: string, weekday = false): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  const day = DAYS_LONG[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday ? `${day} ` : ''}${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

/** Today's date in the UK, 'YYYY-MM-DD'. */
export function todayUk(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

/** '15:00:00' -> '15:00'. */
export function kickoffClock(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? `${m[1]}:${m[2]}` : null;
}

export function ordinal(n: number): string {
  const r100 = n % 100;
  if (r100 >= 11 && r100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The FAQPage object for a page's Common questions -- exactly the visible
 * Q&As, nothing more. */
export function faqJsonLd(faqs: Faq[]): object | null {
  if (faqs.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

// ---- Team page --------------------------------------------------------------

/** The next fixture that will actually be played (not postponed). */
export function nextTeamMatch(matches: TeamPageMatch[]): TeamPageMatch | null {
  return matches.find((m) => !hasKickedOff(m.status) && !isPostponed(m.status)) ?? null;
}

export function teamAnswer(
  profile: TeamPageProfile,
  matches: TeamPageMatch[],
  standing: TeamStanding | null | undefined,
  asOf: string
): Answer {
  const name = profile.display_name;
  const league = profile.league_name;
  const next = nextTeamMatch(matches);
  // A game played but not yet in the confirmed results (football-data
  // confirms lower-league results up to three days later): the table
  // doesn't count it yet, so say so rather than present a stale table as
  // current.
  const awaiting = matches.filter((m) => hasKickedOff(m.status) && m.goals_for == null).length;
  const confirmedNote = awaiting > 0 ? ` (confirmed results only; ${plural(awaiting, 'result')} still to be confirmed)` : '';

  const fixtureName = (m: TeamPageMatch) => (m.is_home ? `${name} v ${m.opponent_name}` : `${m.opponent_name} v ${name}`);
  const when = (m: TeamPageMatch) => {
    const clock = kickoffClock(m.kickoff_time);
    return `${formatMatchDateWithYear(m.kickoff_date)}${clock ? `, ${clock}` : ''}`;
  };
  const hasChances = (m: TeamPageMatch) => m.model_win != null && m.model_draw != null && m.model_loss != null;

  const parts: string[] = [];
  let first = `As of ${longDate(asOf)}, `;
  if (standing && league && standing.played > 0) {
    first += `${name} are ${ordinal(standing.position)} in the ${league} with ${plural(standing.points, 'point')} from ${plural(standing.played, 'game')}${confirmedNote}.`;
  } else if (standing && league) {
    first += `${name} have not yet played a ${league} game this season.`;
  } else if (league) {
    first += `${name} play in the ${league}.`;
  } else {
    first = '';
  }
  if (first) parts.push(first);
  if (next) {
    let s = `Next: ${fixtureName(next)}, ${when(next)}`;
    if (hasChances(next)) s += `; our model gives ${name} a ${pct(next.model_win!)} chance of winning`;
    parts.push(`${s}.`);
  }
  const lead = parts.length ? parts.join(' ') : null;

  const faqs: Faq[] = [];
  if (next) {
    faqs.push({
      q: `When is ${name}'s next match?`,
      a: `${name}'s next match is ${fixtureName(next)}${league ? ` in the ${league}` : ''} on ${longDate(next.kickoff_date, true)}${kickoffClock(next.kickoff_time) ? ` at ${kickoffClock(next.kickoff_time)} (UK time)` : ''}.`,
    });
    if (hasChances(next)) {
      faqs.push({
        q: `What are ${name}'s chances in their next match?`,
        a: `For ${fixtureName(next)}, our model gives ${name} a ${pct(next.model_win!)} chance of winning, ${pct(next.model_draw!)} for a draw and ${pct(next.model_loss!)} for ${next.opponent_name}.` +
          (next.predicted_goals_for != null && next.predicted_goals_against != null
            ? ` It expects ${next.predicted_goals_for.toFixed(1)} goals for ${name} and ${next.predicted_goals_against.toFixed(1)} for ${next.opponent_name}.`
            : ''),
      });
    }
  }
  if (standing && league && standing.played > 0) {
    faqs.push({
      q: `Where are ${name} in the ${league} table?`,
      a: `As of ${longDate(asOf)}, ${name} are ${ordinal(standing.position)} of ${standing.teams} in the ${league}, with ${plural(standing.points, 'point')} from ${plural(standing.played, 'game')}${confirmedNote}.`,
    });
    faqs.push({
      q: `How have ${name} done this season?`,
      a: `In the ${league} this season ${name} have won ${standing.won}, drawn ${standing.drawn} and lost ${standing.lost}, scoring ${standing.goals_for} and conceding ${standing.goals_against}${confirmedNote}.`,
    });
  }
  if (profile.goals_for_per_game != null && profile.goals_against_per_game != null) {
    faqs.push({
      q: `How strong are ${name} rated?`,
      a: `Against an average opponent on neutral ground, our model expects ${name} to score ${profile.goals_for_per_game.toFixed(2)} and concede ${profile.goals_against_per_game.toFixed(2)} goals per game` +
        `${profile.fitted_at ? ` (model fit of ${longDate(profile.fitted_at)})` : ''}.` +
        (profile.is_estimated ? ` This is an estimated rating: ${name} don't yet have enough matches in this division to fit directly.` : ''),
    });
  }
  return { lead, faqs: faqs.slice(0, 6) };
}

// ---- Match page -------------------------------------------------------------

export function matchAnswer(match: MatchPagePrediction, broadcasts: FixtureBroadcast[] | null | undefined): Answer {
  const home = match.home_team_name;
  const away = match.away_team_name;
  const fixture = `${home} v ${away}`;
  const date = longDate(match.kickoff_date, true);
  const clock = kickoffClock(match.kickoff_time);
  const model = match.model;
  const market = match.market ?? null;
  const played = match.status === 'played' && match.actual_home_goals != null && match.actual_away_goals != null;
  const postponed = isPostponed(match.status);
  const kicked = hasKickedOff(match.status);

  const modelLine = (past: boolean) =>
    model
      ? `${past ? 'Before kick-off our model gave' : 'Our model gives'} ${home} a ${pct(model.homeWinPct / 100)} chance of winning, the draw ${pct(model.drawPct / 100)} and ${away} ${pct(model.awayWinPct / 100)}.`
      : null;
  const marketLine = (past: boolean) =>
    market ? `The betting market ${past ? 'had' : 'has'} ${home} at ${pct(market.home)}, the draw ${pct(market.draw)} and ${away} ${pct(market.away)}.` : null;

  const resultLine = () => {
    const h = match.actual_home_goals!;
    const a = match.actual_away_goals!;
    if (h > a) return `${home} beat ${away} ${h}–${a} in the ${match.league_name} on ${date}.`;
    if (h < a) return `${away} beat ${home} ${a}–${h} away from home in the ${match.league_name} on ${date}.`;
    return `${home} and ${away} drew ${h}–${a} in the ${match.league_name} on ${date}.`;
  };

  let lead: string;
  if (played) {
    lead = [resultLine(), modelLine(true)].filter(Boolean).join(' ');
  } else if (postponed) {
    lead = `${fixture} (${match.league_name}), due on ${date}, has been postponed; the new date is to be confirmed.`;
  } else if (kicked) {
    lead =
      match.reported_home_goals != null && match.reported_away_goals != null
        ? `${fixture} (${match.league_name}) on ${date} finished ${match.reported_home_goals}–${match.reported_away_goals} (provisional, awaiting confirmation).`
        : `${fixture} (${match.league_name}) was played on ${date}; the result is to follow.`;
  } else {
    lead = [
      `${fixture} (${match.league_name}) ${clock ? `kicks off at ${clock} (UK time) on ${date}` : `is on ${date}`}.`,
      modelLine(false),
      marketLine(false),
    ].filter(Boolean).join(' ');
  }

  const faqs: Faq[] = [];
  faqs.push({
    q: played || kicked ? `When was ${fixture}?` : `When is ${fixture}?`,
    a: postponed
      ? `${fixture} was due on ${date} but has been postponed; the new date is to be confirmed.`
      : `${fixture} (${match.league_name}${match.matchweek != null ? `, matchweek ${match.matchweek}` : ''}) ${played || kicked ? 'was played' : 'is'} on ${date}${clock ? `, kicking off at ${clock} UK time` : ''}.`,
  });
  if (played) {
    faqs.push({ q: `What was the result of ${fixture}?`, a: resultLine() });
  }
  if (model) {
    const outcomes = [
      { who: home, p: model.homeWinPct },
      { who: 'draw', p: model.drawPct },
      { who: away, p: model.awayWinPct },
    ].sort((x, y) => y.p - x.p);
    const top = outcomes[0];
    const modelView =
      top.who === 'draw'
        ? `Our model ${played ? 'had' : 'has'} a draw as the most likely result, at ${pct(top.p / 100)}.`
        : `Our model ${played ? 'made' : 'makes'} ${top.who} the favourite, with a ${pct(top.p / 100)} chance of winning (draw ${pct(model.drawPct / 100)}, ${top.who === home ? away : home} ${pct((top.who === home ? model.awayWinPct : model.homeWinPct) / 100)}).`;
    let marketView = '';
    if (market) {
      const m = [
        { who: home, p: market.home },
        { who: 'draw', p: market.draw },
        { who: away, p: market.away },
      ].sort((x, y) => y.p - x.p)[0];
      marketView =
        m.who === 'draw'
          ? ` The betting market ${played ? 'had' : 'has'} the draw as most likely, at ${pct(m.p)}.`
          : ` The betting market ${m.who === top.who ? 'also ' : ''}${played ? 'had' : 'has'} ${m.who} as favourite, at ${pct(m.p)}.`;
    }
    faqs.push({ q: `Who ${played ? 'was' : 'is'} the favourite for ${fixture}?`, a: `${modelView}${marketView}` });
    const likely = mostLikelyScore(model);
    faqs.push({
      q: `What ${played ? 'was' : 'is'} the most likely score in ${fixture}?`,
      a: `According to our model, the single most likely score ${played ? 'was' : 'is'} ${home} ${likely.home}–${likely.away} ${away}, at ${(likely.probability * 100).toFixed(1)}%. It ${played ? 'expected' : 'expects'} ${match.predicted_home_goals?.toFixed(2)} goals for ${home} and ${match.predicted_away_goals?.toFixed(2)} for ${away}.`,
    });
  }
  // TV: only when the data says something either way, and only for a match
  // still to be played. No rows means "not yet known", never "not on TV".
  if (!kicked && !postponed && broadcasts && broadcasts.length > 0) {
    const shown = broadcasts.filter((b) => b.status === 'confirmed_broadcast');
    if (shown.length > 0) {
      const names = [...new Set(shown.map((b) => [b.broadcaster, b.channel && b.channel !== b.broadcaster ? `(${b.channel})` : null].filter(Boolean).join(' ')).filter(Boolean))];
      faqs.push({ q: `Is ${fixture} on TV in the UK?`, a: `Yes. ${fixture} is being shown live in the UK on ${names.join(' and ')}.` });
    } else if (broadcasts.some((b) => b.status === 'confirmed_not_televised')) {
      faqs.push({ q: `Is ${fixture} on TV in the UK?`, a: `No. ${fixture} is not being shown live on UK TV.` });
    }
  }
  return { lead, faqs: faqs.slice(0, 6) };
}

// ---- FPL player page --------------------------------------------------------

const FPL_STATUS: Record<string, string> = {
  a: 'available',
  d: 'doubtful',
  i: 'injured',
  s: 'suspended',
  u: 'unavailable',
  n: 'not in the squad',
};

export function playerAnswer(profile: PlayerPageProfile, season: PlayerPageGameweek[], asOf: string): Answer {
  const name = profile.full_name;
  const upcoming = season.filter((g) => g.projected_points != null && !hasKickedOff(g.status));
  const total = upcoming.reduce((s, g) => s + (g.projected_points ?? 0), 0);
  const next = upcoming[0] ?? null;
  const nextFixture = season.find((g) => !hasKickedOff(g.status)) ?? null;
  const owned = profile.selected_by_percent != null && Number.isFinite(profile.selected_by_percent) ? profile.selected_by_percent : null;

  const tags = [profile.team_name, profile.price != null ? `£${profile.price.toFixed(1)}m` : null, owned != null ? `${owned.toFixed(1)}% owned` : null].filter(Boolean).join(', ');
  const opp = (g: PlayerPageGameweek) => `${g.opponent_name} (${g.is_home ? 'H' : 'A'})`;

  let lead: string;
  if (upcoming.length > 0 && next) {
    lead =
      `As of ${longDate(asOf)}, ${name} (${tags}) is projected ${total.toFixed(1)} FPL points over the next ${plural(upcoming.length, 'gameweek')}; ` +
      `next: v ${opp(next)} in gameweek ${next.matchweek}, ${next.projected_points!.toFixed(1)} points.`;
  } else {
    lead = `As of ${longDate(asOf)}, ${name} (${tags}) has no FPL projection for the gameweeks ahead.`;
  }

  const faqs: Faq[] = [];
  if (upcoming.length > 0 && next) {
    faqs.push({
      q: `How many FPL points is ${name} projected to score?`,
      a: `Our model projects ${name} ${next.projected_points!.toFixed(1)} points in gameweek ${next.matchweek} (v ${opp(next)}) and ${total.toFixed(1)} across the next ${plural(upcoming.length, 'gameweek')}.` +
        (next.expected_minutes != null ? ` It expects ${Math.round(next.expected_minutes)} minutes in gameweek ${next.matchweek}${next.start_probability != null ? `, with a ${Math.round(next.start_probability * 100)}% chance of starting` : ''}.` : ''),
    });
  }
  if (profile.status) {
    const label = FPL_STATUS[profile.status] ?? profile.status;
    const news = profile.news && profile.news.trim() ? profile.news.trim() : null;
    let a: string;
    if (profile.status === 'a') {
      a = `Yes. ${name} is listed as available in the official FPL game${news ? ` (${news})` : ''}.`;
    } else {
      a = `${name} is listed as ${label} in the official FPL game` +
        `${news ? `: ${news.replace(/\.$/, '')}` : ''}` +
        `${profile.chance_next_round != null ? `. FPL gives a ${profile.chance_next_round}% chance of playing in the next round` : ''}` +
        `${profile.news_added ? ` (news added ${longDate(profile.news_added)})` : ''}.`;
    }
    faqs.push({ q: `Is ${name} injured or available?`, a });
  }
  if (nextFixture) {
    faqs.push({
      q: `Who does ${name} play next?`,
      a: `In gameweek ${nextFixture.matchweek}, ${profile.team_name} play ${nextFixture.opponent_name} ${nextFixture.is_home ? 'at home' : 'away'} on ${longDate(nextFixture.kickoff_date, true)}.`,
    });
  }
  if (profile.price != null || owned != null) {
    faqs.push({
      q: `How much does ${name} cost in FPL?`,
      a: [
        profile.price != null ? `${name} costs \u00a3${profile.price.toFixed(1)}m in Fantasy Premier League` : null,
        owned != null ? `${profile.price != null ? 'and is' : `${name} is`} selected by ${owned.toFixed(1)}% of FPL managers` : null,
      ].filter(Boolean).join(' ') + '.',
    });
  }
  return { lead, faqs: faqs.slice(0, 6) };
}

// Answer-first entity pages (1 Nov 2026): a plain, dated opening sentence and
// a "Common questions" section on the team, match and FPL player pages, with
// FAQPage JSON-LD carrying exactly the visible Q&As.
import { describe, expect, it, vi } from 'vitest';
import { buildDocument, renderMatchPage, renderPlayerPage, renderTeamPage } from '../entry-server';
import { faqJsonLd, kickoffClock, longDate, matchAnswer, ordinal, playerAnswer, teamAnswer, todayUk, type Faq } from '../lib/answerFirst';
import type { TeamPageData } from '../pages/football/TeamPage';
import type { MatchPagePrediction } from '../lib/matchPageApi';
import type { FixtureBroadcast } from '../lib/broadcastsApi';

vi.mock('../components/TeamHistoryPanel', () => ({ default: () => null }));
vi.mock('../lib/financeApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/financeApi')>('../lib/financeApi');
  return { ...actual, teamHasFinance: vi.fn().mockResolvedValue(false) };
});

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** The visible Q&As in server HTML, in order. */
function visibleFaqs(html: string): Faq[] {
  const section = /<section[^>]*data-testid="common-questions"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  const out: Faq[] = [];
  const re = /<dt[^>]*>([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) out.push({ q: decode(m[1].replace(/<!-- -->/g, '')), a: decode(m[2].replace(/<!-- -->/g, '')) });
  return out;
}

function lead(html: string): string | null {
  const m = /<p[^>]*data-testid="answer-lead"[^>]*>([\s\S]*?)<\/p>/.exec(html);
  return m ? decode(m[1].replace(/<!-- -->/g, '')) : null;
}

type FaqLd = { '@context': string; '@type': string; mainEntity: { '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }[] };

function faqLd(structuredData: object[]): FaqLd | undefined {
  return structuredData.find((o) => (o as { '@type'?: string })['@type'] === 'FAQPage') as FaqLd | undefined;
}

/** FAQPage -> mainEntity[] Question{name, acceptedAnswer: Answer{text}}, and
 * the text identical to what the page shows. */
function expectFaqMatches(page: { html: string; structuredData: object[] }) {
  const ld = faqLd(page.structuredData);
  expect(ld).toBeDefined();
  expect(ld!['@context']).toBe('https://schema.org');
  expect(Array.isArray(ld!.mainEntity)).toBe(true);
  expect(ld!.mainEntity.length).toBeGreaterThanOrEqual(3);
  expect(ld!.mainEntity.length).toBeLessThanOrEqual(6);
  for (const q of ld!.mainEntity) {
    expect(q['@type']).toBe('Question');
    expect(typeof q.name).toBe('string');
    expect(q.acceptedAnswer['@type']).toBe('Answer');
    expect(q.acceptedAnswer.text.length).toBeGreaterThan(10);
  }
  expect(visibleFaqs(page.html)).toEqual(ld!.mainEntity.map((q) => ({ q: q.name, a: q.acceptedAnswer.text })));
  // And it reaches the document head as JSON-LD.
  const doc = buildDocument('<html><head><title>x</title><meta name="description" content="x" /></head><body><div id="root"></div></body></html>', page as never);
  expect(doc).toContain('"@type":"FAQPage"');
}

describe('formatting helpers', () => {
  it('dates, times and ordinals in plain UK English', () => {
    expect(longDate('2026-11-01')).toBe('1 November 2026');
    expect(longDate('2026-11-21', true)).toBe('Saturday 21 November 2026');
    expect(longDate('2026-10-31T18:57:00Z')).toBe('31 October 2026');
    expect(kickoffClock('15:00:00')).toBe('15:00');
    expect(kickoffClock(null)).toBeNull();
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd']);
    expect(todayUk(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01'); // BST
    expect(faqJsonLd([])).toBeNull();
  });
});

const team: TeamPageData = {
  profile: { team_id: 1, slug: 'arsenal', display_name: 'Arsenal', league_name: 'Premier League', league_id: 1, goals_for_per_game: 2.1, goals_against_per_game: 0.8, is_estimated: false, fitted_at: '2026-10-31T06:00:00Z' },
  matches: [
    { slug: 'arsenal-v-spurs-2026-10-25', kickoff_date: '2026-10-25', opponent_name: 'Spurs', is_home: true, status: 'played', goals_for: 2, goals_against: 0, predicted_goals_for: 2.0, predicted_goals_against: 0.9 },
    { slug: 'arsenal-v-burnley-2026-11-08', kickoff_date: '2026-11-08', kickoff_time: '15:00:00', opponent_name: 'Burnley', is_home: true, status: 'scheduled', goals_for: null, goals_against: null, predicted_goals_for: 2.2, predicted_goals_against: 0.7, model_win: 0.712, model_draw: 0.18, model_loss: 0.108 },
  ],
  hasFinance: false,
  fplPlayers: [],
  standing: { position: 2, teams: 20, played: 8, won: 6, drawn: 3, lost: 0, goals_for: 18, goals_against: 5, points: 21 },
  asOf: '2026-11-01',
};

describe('team page', () => {
  const page = renderTeamPage('arsenal', team);

  it('opens with a dated answer: table position, points, next match and the model chance', () => {
    expect(lead(page.html)).toBe(
      'As of 1 November 2026, Arsenal are 2nd in the Premier League with 21 points from 8 games. Next: Arsenal v Burnley, Sun 8 Nov 2026, 15:00; our model gives Arsenal a 71% chance of winning.'
    );
    // The dated model-fit line is kept, below the answer.
    expect(page.html.indexOf('data-testid="answer-lead"')).toBeLessThan(page.html.indexOf('Ratings from the model fit of'));
  });

  it('Common questions match the FAQPage JSON-LD', () => {
    expectFaqMatches(page);
    const qs = visibleFaqs(page.html).map((f) => f.q);
    expect(qs).toEqual([
      "When is Arsenal's next match?",
      "What are Arsenal's chances in their next match?",
      'Where are Arsenal in the Premier League table?',
      'How have Arsenal done this season?',
      'How strong are Arsenal rated?',
    ]);
    expect(visibleFaqs(page.html)[1].a).toBe('For Arsenal v Burnley, our model gives Arsenal a 71% chance of winning, 18% for a draw and 11% for Burnley. It expects 2.2 goals for Arsenal and 0.7 for Burnley.');
  });

  it('says when the table does not yet count a played game', () => {
    const a = teamAnswer(team.profile, [...team.matches, { slug: null, kickoff_date: '2026-10-31', opponent_name: 'Leeds', is_home: false, status: 'played', goals_for: null, goals_against: null, reported_goals_for: 1, reported_goals_against: 1, predicted_goals_for: null, predicted_goals_against: null }], team.standing, '2026-11-01');
    expect(a.lead).toContain('from 8 games (confirmed results only; 1 result still to be confirmed).');
  });

  it('states only what the data has: no standing, no prediction, no next match', () => {
    const a = teamAnswer({ ...team.profile, goals_for_per_game: null, goals_against_per_game: null }, [], null, '2026-11-01');
    expect(a.lead).toBe('As of 1 November 2026, Arsenal play in the Premier League.');
    expect(a.faqs).toEqual([]);
    const page2 = renderTeamPage('arsenal', { ...team, standing: null, matches: [], profile: { ...team.profile, goals_for_per_game: null, goals_against_per_game: null } });
    expect(faqLd(page2.structuredData)).toBeUndefined();
    expect(page2.html).not.toContain('Common questions');
  });
});

const match: MatchPagePrediction & { __rho?: number | null } = {
  fixture_id: 11, slug: 'wolves-v-derby-2026-11-21', home_team_name: 'Wolves', away_team_name: 'Derby', home_team_slug: 'wolves', away_team_slug: 'derby',
  kickoff_date: '2026-11-21', kickoff_time: '15:00:00', status: 'scheduled', matchweek: 17, league_name: 'Championship',
  predicted_home_goals: 1.6, predicted_away_goals: 0.9, predicted_at: '2026-10-28T09:00:00Z', fit_run_id: 7, model: null,
  actual_home_goals: null, actual_away_goals: null,
  market: { home: 0.45, draw: 0.28, away: 0.27, captured_at: '2026-10-28T10:00:00Z' },
  __rho: -0.06,
};

const sky = { broadcastId: 1, fixtureId: 11, market: 'GB', status: 'confirmed_broadcast', broadcaster: 'Sky Sports', channel: 'Sky Sports Football' } as FixtureBroadcast;

describe('match page', () => {
  it('upcoming: kick-off, the model and the market in the opening sentence', () => {
    const page = renderMatchPage(match.slug, match);
    const l = lead(page.html)!;
    expect(l).toMatch(/^Wolves v Derby \(Championship\) kicks off at 15:00 \(UK time\) on Saturday 21 November 2026\. Our model gives Wolves a \d+% chance of winning, the draw \d+% and Derby \d+%\. The betting market has Wolves at 45%, the draw 28% and Derby 27%\.$/);
    expect(page.html.indexOf('data-testid="answer-lead"')).toBeLessThan(page.html.indexOf('Prediction made'));
    expectFaqMatches(page);
    const qs = visibleFaqs(page.html).map((f) => f.q);
    expect(qs).toEqual(['When is Wolves v Derby?', 'Who is the favourite for Wolves v Derby?', 'What is the most likely score in Wolves v Derby?']);
  });

  it('asks "on UK TV?" only when the broadcast data says either way', () => {
    const shown = renderMatchPage(match.slug, { ...match, broadcasts: [sky] });
    expectFaqMatches(shown);
    expect(visibleFaqs(shown.html).at(-1)).toEqual({ q: 'Is Wolves v Derby on TV in the UK?', a: 'Yes. Wolves v Derby is being shown live in the UK on Sky Sports (Sky Sports Football).' });
    const notShown = renderMatchPage(match.slug, { ...match, broadcasts: [{ ...sky, status: 'confirmed_not_televised', broadcaster: null, channel: null }] });
    expect(visibleFaqs(notShown.html).at(-1)!.a).toBe('No. Wolves v Derby is not being shown live on UK TV.');
    expect(visibleFaqs(renderMatchPage(match.slug, { ...match, broadcasts: [] }).html).map((f) => f.q)).not.toContain('Is Wolves v Derby on TV in the UK?');
  });

  it('played: the result first, then what the model said beforehand', () => {
    const page = renderMatchPage(match.slug, { ...match, status: 'played', actual_home_goals: 1, actual_away_goals: 2 });
    expect(lead(page.html)).toMatch(/^Derby beat Wolves 2–1 away from home in the Championship on Saturday 21 November 2026\. Before kick-off our model gave Wolves a \d+% chance/);
    expectFaqMatches(page);
    expect(visibleFaqs(page.html).map((f) => f.q)).toContain('What was the result of Wolves v Derby?');
  });

  it('postponed and no prediction: no invented numbers', () => {
    const a = matchAnswer({ ...match, status: 'postponed', model: null, market: null }, []);
    expect(a.lead).toBe('Wolves v Derby (Championship), due on Saturday 21 November 2026, has been postponed; the new date is to be confirmed.');
    expect(a.faqs.map((f) => f.q)).toEqual(['When is Wolves v Derby?']);
  });
});

const player = {
  profile: {
    fpl_player_id: 1, fpl_code: 9, slug: 'erling-haaland', web_name: 'Haaland', full_name: 'Erling Haaland', canonical_team_id: 43, team_name: 'Man City', team_slug: 'man-city', position_label: 'Forward', price: 15.8,
    status: 'd', chance_next_round: 75, news: 'Knock - 75% chance of playing', news_added: '2026-10-30T12:00:00Z', selected_by_percent: 78.9,
  },
  season: [
    { matchweek: 9, kickoff_date: '2026-10-25', opponent_name: 'Leeds', is_home: false, status: 'played', projected_points: 6.1, expected_minutes: 85, actual_points: 13, generated_at: '2026-10-24T18:00:00Z', model_version: 'leaguewide_v6' },
    { matchweek: 10, kickoff_date: '2026-11-07', opponent_name: 'Brighton', is_home: true, status: 'scheduled', projected_points: 7.1, expected_minutes: 84, actual_points: null, generated_at: '2026-10-31T18:57:00Z', model_version: 'leaguewide_v6', start_probability: 0.9 },
    { matchweek: 11, kickoff_date: '2026-11-21', opponent_name: 'Spurs', is_home: false, status: 'scheduled', projected_points: 6.4, expected_minutes: 84, actual_points: null, generated_at: '2026-10-31T18:57:00Z', model_version: 'leaguewide_v6' },
  ],
  asOf: '2026-11-01',
};

describe('FPL player page', () => {
  const page = renderPlayerPage('erling-haaland', player as never);

  it('opens with a dated answer: club, price, ownership, projection and next fixture', () => {
    expect(lead(page.html)).toBe(
      'As of 1 November 2026, Erling Haaland (Man City, £15.8m, 78.9% owned) is projected 13.5 FPL points over the next 2 gameweeks; next: v Brighton (H) in gameweek 10, 7.1 points.'
    );
    expect(page.html.indexOf('data-testid="answer-lead"')).toBeLessThan(page.html.indexOf('Projections updated'));
  });

  it('Common questions match the FAQPage JSON-LD, availability from FPL', () => {
    expectFaqMatches(page);
    const faqs = visibleFaqs(page.html);
    expect(faqs.map((f) => f.q)).toEqual([
      'How many FPL points is Erling Haaland projected to score?',
      'Is Erling Haaland injured or available?',
      'Who does Erling Haaland play next?',
      'How much does Erling Haaland cost in FPL?',
    ]);
    expect(faqs[1].a).toBe('Erling Haaland is listed as doubtful in the official FPL game: Knock - 75% chance of playing. FPL gives a 75% chance of playing in the next round (news added 30 October 2026).');
    expect(faqs[3].a).toBe('Erling Haaland costs £15.8m in Fantasy Premier League and is selected by 78.9% of FPL managers.');
  });

  it('available, no ownership: plain answers without gaps', () => {
    const a = playerAnswer({ ...player.profile, status: 'a', news: '', selected_by_percent: null }, player.season, '2026-11-01');
    expect(a.faqs.find((f) => f.q.startsWith('Is '))!.a).toBe('Yes. Erling Haaland is listed as available in the official FPL game.');
    expect(a.lead).toContain('(Man City, £15.8m)');
  });
});

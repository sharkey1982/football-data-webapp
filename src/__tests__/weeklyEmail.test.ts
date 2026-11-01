// The FPL weekly email builder (supabase/functions/email-weekly/build.ts):
// sections and their order, unsubscribe links and headers, the football
// section's wording and "Not a betting tip. 18+.", missing sections,
// personalisation, clean HTML.
import { describe, expect, it } from 'vitest';
import {
  buildWeeklyEmail, fixtureText, formText, manageUrl, MARKET_DISCLAIMER, MARKET_HEADING, oneClickUrl, resultLine, unsubscribeUrl,
  weeklySubject, type Facts, type Personal, type Sections, type WeeklyContent,
} from '../../supabase/functions/email-weekly/build.ts';

const fx = (a: [string, boolean][]) => a.map(([opp, home], i) => ({ gw: 10 + i, opp, home }));
const P = (o: Partial<Facts> & Pick<Facts, 'id' | 'name'>): Facts => ({
  team: 'ARS', slug: o.name.toLowerCase(), pos: 'MID', price: 6, own: 10, status: 'a', chance: null, news: null,
  start: 0.95, x1: 5, x5: 25, fixtures: fx([['HUL', true], ['NEW', false], ['MCI', true]]),
  l5: { gws: 5, g: 1, a: 1, xg: 1, xa: 1, pts: 25, mins: 450, m3: [90, 90, 90] },
  week_before: null, tonight: null, p_blank: null, ...o,
});

const ODE = P({ id: 15, name: 'Ødegaard', x1: 7.33, start: 0.94, p_blank: 0.18 });
const HAA = P({ id: 411, name: 'Haaland', team: 'MCI', pos: 'FWD', price: 15.8, own: 78.9, x1: 7.21, start: 0.82, fixtures: fx([['NFO', false], ['FUL', true], ['ARS', false]]), week_before: 15.7 });
const JP = P({ id: 165, name: 'João Pedro', team: 'CHE', pos: 'FWD', price: 7.7, own: 43.8, status: 'i', news: 'Thigh injury - Unknown return date', start: 0, x1: 0, x5: 3.59, l5: { gws: 5, g: 2, a: 0, xg: 0.88, xa: 0.12, pts: 14, mins: 161, m3: [90, 0, 0] } });
const HAV = P({ id: 26, name: 'Havertz', pos: 'FWD', price: 7.4, x5: 22.48 });
const ISAK = P({ id: 379, name: 'Isak', team: 'LIV', pos: 'FWD', price: 9.2, week_before: 9, tonight: { direction: 'rise', outlook: 'expected' }, l5: { gws: 5, g: 3, a: 0, xg: 1.48, xa: 0.07, pts: 26, mins: 400, m3: [90, 78, 76] } });
const GIBBS = P({ id: 480, name: 'Gibbs-White', team: 'NFO', l5: { gws: 5, g: 0, a: 0, xg: 0.86, xa: 1.02, pts: 6, mins: 360, m3: [0, 90, 90] }, diff: -1.87 });

const SECTIONS: Sections = {
  personal: false,
  captain: { pick: ODE, alt: HAA, overall: ODE },
  change: [{ out: JP, in: HAV, gain: 18.9 }],
  luck_scope: 'all',
  unlucky: [GIBBS],
  lucky: [],
  minutes: [JP],
  watchlist: [],
  prices: { since: '2026-10-25', notable: [HAA], mine: [], tonight: [ISAK] },
};

const FULL: WeeklyContent = {
  season_id: 13,
  gw: 10,
  deadline: '2026-11-06T18:30:00+00:00',
  sections: SECTIONS,
  preview: { title: 'FPL GW10 preview (2026/27)', path: '/fpl/gameweek/2026-27/10/preview', published_at: '2026-11-05T17:00:00Z' },
  market: [{
    home: 'Juventus', away: 'Napoli', league: 'Serie A', day: '2026-11-07', kickoff: '19:45', slug: 'juventus-v-napoli',
    outcome: 'away', gap: 0.088, market: [0.4167, 0.2885, 0.2948], model: [0.3433, 0.2737, 0.3829],
  }],
};

const EMPTY: WeeklyContent = {
  ...FULL,
  preview: null, market: [],
  sections: {
    personal: false, captain: { pick: null, alt: null, overall: null }, change: [], luck_scope: 'all', unlucky: [], lucky: [],
    minutes: [], watchlist: [], prices: { since: null, notable: [], mine: [], tonight: [] },
  },
};

const TOKEN = 'a'.repeat(48);
const order = (text: string, heads: string[]) => heads.map((h) => text.indexOf(h));

describe('weekly email builder', () => {
  it('has the deadline in UK time and the sections in order, linking to the site', () => {
    const m = buildWeeklyEmail(FULL, { football: true, token: TOKEN });
    expect(m.subject).toBe('FPL GW10: deadline Fri 6 Nov, 18:30');
    expect(m.text).toContain('Deadline Fri 6 Nov, 18:30 (UK time)');
    const idx = order(m.text, ['CAPTAIN', 'WHO TO THINK ABOUT CHANGING', 'LUCKY AND UNLUCKY', 'MINUTES RISKS', 'PRICE MOVES', 'GW10 PREVIEW', MARKET_HEADING.toUpperCase()]);
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(m.html).toContain('href="https://fixtureshark.com/fpl/players/ødegaard"');
    expect(m.html).toContain('href="https://fixtureshark.com/fpl/gameweek/2026-27/10/preview"');
  });

  it('gives one captain pick and one alternative, each with a reason', () => {
    const m = buildWeeklyEmail(FULL, { football: false, token: TOKEN });
    expect(m.text).toContain('Pick: Ødegaard (ARS) v HUL (H): 7.3 projected, 94% to start, 18% blank chance.');
    expect(m.text).toContain("Alternative: Haaland (MCI) v NFO (A): 7.2 projected, but 18% chance he doesn't start.");
    expect(m.text).not.toMatch(/^\d\. /m); // no top-5 list
  });

  it('pairs sell candidates with like-for-like replacements, and reports luck and minutes with the numbers', () => {
    const m = buildWeeklyEmail(FULL, { football: false, token: TOKEN });
    expect(m.text).toContain('João Pedro (CHE) £7.7m: 3.6 projected (Thigh injury - Unknown return date; 0% to start) → Havertz (ARS) £7.4m: 22.5 (+18.9)');
    expect(m.text).toContain('Unlucky: Gibbs-White (NFO): 0 goals, 0 assists from 0.9 xG and 1.0 xA in the last 5 GWs (6 pts)');
    expect(m.text).toContain('João Pedro (CHE): Thigh injury - Unknown return date; 0% to start GW10; minutes in the last 3: 90, 0, 0');
  });

  it('keeps price moves short: notable movers and tonight, one per line', () => {
    const m = buildWeeklyEmail(FULL, { football: false, token: TOKEN });
    expect(m.text).toContain('PRICE MOVES SINCE SUN 25 OCT');
    expect(m.text).toContain('- Most-owned mover: Haaland (MCI) £15.7m → £15.8m, 78.9% owned');
    expect(m.text).toContain('- Tonight: Isak (LIV) £9.2m: likely to rise tonight');
    expect(m.text).not.toMatch(/and \d+ more/);
  });

  it('carries a working unsubscribe link, a manage link and RFC 8058 headers', () => {
    const m = buildWeeklyEmail(FULL, { football: false, token: TOKEN });
    expect(m.html).toContain(`href="${unsubscribeUrl(TOKEN)}"`);
    expect(m.html).toContain(`href="${manageUrl(TOKEN)}"`);
    expect(m.text).toContain(unsubscribeUrl(TOKEN));
    expect(m.headers['List-Unsubscribe']).toBe(`<${oneClickUrl(TOKEN)}>`);
    expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(oneClickUrl(TOKEN)).toMatch(/^https:\/\/.+\/functions\/v1\/email-list\?a=one-click&t=a{48}$/);
  });

  it('shows the football section only when chosen, with both sets of probabilities and the disclaimer', () => {
    const off = buildWeeklyEmail(FULL, { football: false, token: TOKEN });
    expect(off.html).not.toContain(MARKET_HEADING);
    expect(off.text).not.toContain(MARKET_DISCLAIMER);

    const on = buildWeeklyEmail(FULL, { football: true, token: TOKEN });
    expect(MARKET_HEADING).toBe('Where our model and the market disagree');
    expect(MARKET_DISCLAIMER).toBe('Not a betting tip. 18+.');
    expect(on.html).toContain(MARKET_HEADING);
    for (const s of [on.html, on.text]) {
      expect(s).toContain('Not a betting tip. 18+.');
      expect(s).toContain('Market: Juventus 42% · Draw 29% · Napoli 29%');
      expect(s).toContain('Our model: Juventus 34% · Draw 27% · Napoli 38%');
      expect(s).not.toMatch(/\b(bet now|odds boost|free bet|stake|value bet)\b/i);
    }
    expect(buildWeeklyEmail(EMPTY, { football: true, token: TOKEN }).text).toContain('Not a betting tip. 18+.');
  });

  it('handles missing sections', () => {
    const m = buildWeeklyEmail(EMPTY, { football: false, token: TOKEN });
    expect(m.text).toContain("Our projections for GW10 aren't ready yet.");
    for (const h of ['WHO TO THINK', 'LUCKY AND UNLUCKY', 'MINUTES RISKS', 'YOUR WATCHLIST', 'PRICE MOVES', 'YOUR TEAM']) expect(m.text).not.toContain(h);
    expect(m.text).toContain('Not published yet.');
    expect(buildWeeklyEmail({ ...EMPTY, deadline: null }, { football: false, token: TOKEN }).subject).toBe('FPL GW10: the week ahead');
  });

  it('marks a test send and gives it inert links', () => {
    const m = buildWeeklyEmail(FULL, { football: true, token: null }, { test: true });
    expect(m.subject).toBe(`[Test] ${weeklySubject(FULL)}`);
    expect(m.text).toContain('Test send to the admin address');
    expect(m.headers['List-Unsubscribe']).toContain('t=test');
  });

  it('escapes data and leaves nothing stray after the footer links', () => {
    const bad = { ...FULL, sections: { ...SECTIONS, minutes: [{ ...JP, news: '<script>x</script> "q"' }] } };
    const m = buildWeeklyEmail(bad, { football: true, token: TOKEN });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toMatch(/>Privacy<\/a><\/p><\/div><\/body><\/html>$/);
    const text = m.html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]*>/g, '');
    expect(text).not.toMatch(/["<>]/);
  });

  it('personalises: Your team first, captain from the squad v the overall pick, the watchlist', () => {
    const mine: Sections = {
      ...SECTIONS,
      personal: true,
      captain: { pick: HAA, alt: P({ id: 68, name: 'Tavernier', team: 'BOU', x1: 6.39, start: 0.97 }), overall: null },
      luck_scope: 'mine',
      watchlist: [ISAK],
      prices: { since: '2026-10-25', notable: [HAA], mine: [HAA], tonight: [] },
    };
    const me: Personal = {
      picks_gw: 9,
      sections: mine,
      club: {
        name: 'Arsenal', slug: 'arsenal',
        next: { home: 'Arsenal', away: 'Chelsea', date: '2026-11-08', time: '16:30:00', tv: 'Sky Sports', is_home: true, slug: 'ars-che', model: { home: 0.55, draw: 0.25, away: 0.2 } },
        last: { home: 'Fleetwood Town', away: 'Arsenal', date: '2026-10-27', is_home: false, slug: 'fle-ars', hg: 1, ag: 1, competition: 'Carabao Cup', pens: [3, 4] },
      },
    };
    const m = buildWeeklyEmail(FULL, { football: false, token: TOKEN, personal: me });
    expect(m.text.indexOf('YOUR TEAM')).toBeLessThan(m.text.indexOf('CAPTAIN, FROM YOUR SQUAD'));
    expect(m.text).toContain('Your FPL squad as at the GW9 deadline');
    expect(m.text).toContain('Pick: Haaland (MCI) v NFO (A): 7.2 projected, 82% to start.');
    expect(m.text).toContain('Our overall pick: Ødegaard (ARS) on 7.3.'); // from the generic issue
    expect(m.text).toContain('Arsenal next: Arsenal v Chelsea (Sun 8 Nov 16:30, Sky Sports): our model: win 55%, draw 25%, lose 20%');
    expect(m.text).toContain('Arsenal last: Fleetwood Town 1-1 Arsenal, Arsenal won 4-3 on penalties, Tue 27 Oct');
    expect(m.text).toContain('YOUR WATCHLIST\n- Isak (LIV): £9.2m (£9.0m → £9.2m this week); 95% to start, 5.0 projected (25.0 over 5 GWs); next: HUL (H), NEW (A), MCI (H)');
    expect(m.text).toContain('likely to rise tonight');
    expect(m.text).toContain('- Yours: Haaland (MCI) £15.7m → £15.8m');
    expect(m.text).not.toContain('Most-owned mover: Haaland'); // not repeated
    expect(m.text).toContain('Your squad and watchlist.');

    // Nothing personal: the generic issue, no "Your team".
    const none = buildWeeklyEmail(FULL, { football: false, token: TOKEN, personal: { picks_gw: null, sections: null, club: null } });
    expect(none.text).not.toContain('YOUR TEAM');
    expect(none.text).toContain('Pick: Ødegaard');
  });

  it('phrases fixtures, form and results plainly', () => {
    expect(fixtureText(HAA, 10)).toBe('v NFO (A)');
    expect(fixtureText({ ...HAA, fixtures: [] }, 10)).toBe('no game');
    expect(formText(ISAK)).toBe('3 goals, 0 assists from 1.5 xG and 0.1 xA in the last 5 GWs (26 pts)');
    const g = { home: 'Fleetwood Town', away: 'Arsenal', date: '2026-10-27', is_home: false, slug: null, hg: 1, ag: 1 };
    expect(resultLine({ ...g, competition: 'Carabao Cup' })).toBe('Fleetwood Town 1-1 Arsenal after 90 minutes (Carabao Cup)');
    expect(resultLine({ ...g, competition: 'Premier League' })).toBe('Fleetwood Town 1-1 Arsenal (Premier League)');
    expect(resultLine({ ...g, competition: 'Carabao Cup', pens: [5, 4] })).toBe('Fleetwood Town 1-1 Arsenal, Fleetwood Town won 5-4 on penalties');
  });
});

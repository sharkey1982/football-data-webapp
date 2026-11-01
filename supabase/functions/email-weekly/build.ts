// ============================================================================
// supabase/functions/email-weekly/build.ts
//
// Builds the "FixtureShark FPL weekly" email (HTML and plain text) from
// public.email_weekly_content (+ public.email_personal for a personalised
// issue). Pure functions, no Deno or Node APIs, so the edge function and the
// site's tests (src/__tests__/weeklyEmail.test.ts) use the same code.
//
// Order (Chris, 1 Nov 2026): Your team -> Captain -> Who to change, and to
// whom -> Lucky / unlucky -> Minutes and line-ups -> Watchlist -> Price moves
// -> preview link -> (optional) where our model and the market disagree.
// Short enough to read on a phone in two minutes: short lines, few of them,
// the numbers shown, no hype.
//
// Plain and fast: one column, inline styles, system fonts, no images. Dark
// mode: explicit colours on every block plus a prefers-color-scheme override
// for the clients that read <style>.
//
// The optional football section must stay "where our model and the market
// disagree", show both sets of probabilities and carry "Not a betting tip.
// 18+.". No advice to bet, no bookmaker links.
// ============================================================================

export const SITE = 'https://fixtureshark.com';
export const FUNCTIONS_BASE = 'https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1';
export const FROM = 'FixtureShark <weekly@mail.fixtureshark.com>';
export const MARKET_DISCLAIMER = 'Not a betting tip. 18+.';
export const MARKET_HEADING = 'Where our model and the market disagree';

/** private.email_player_facts: one player's numbers. */
export type Facts = {
  id: number; name: string; team: string | null; slug: string | null; pos: string | null;
  price: number; own: number; status: string; chance: number | null; news: string | null;
  /** Coming gameweek: start probability and projected points; x5: next five gameweeks. */
  start: number | null; x1: number | null; x5: number | null;
  fixtures: { gw: number; opp: string; home: boolean }[];
  /** Last five gameweeks; m3: minutes in each of the last three. */
  l5: { gws: number; pts: number; g: number; a: number; xg: number; xa: number; mins: number; m3: number[] | null } | null;
  week_before: number | null; since?: string | null;
  tonight: { direction: 'rise' | 'fall'; outlook: string } | null;
  p_blank: number | null;
  diff?: number;
};

/** private.email_sections: the FPL part of an issue (generic, or for one squad and watchlist). */
export type Sections = {
  personal: boolean;
  captain: { pick: Facts | null; alt: Facts | null; overall: Facts | null };
  change: { out: Facts; in: Facts; gain: number }[];
  luck_scope: 'mine' | 'all';
  unlucky: Facts[];
  lucky: Facts[];
  minutes: Facts[];
  watchlist: Facts[];
  prices: { since: string | null; notable: Facts[]; mine: Facts[]; tonight: Facts[] };
};

export type WeeklyContent = {
  season_id: number;
  gw: number;
  deadline: string | null;
  generated_at?: string;
  sections: Sections;
  preview: { title: string; path: string; published_at: string | null } | null;
  market: {
    home: string; away: string; league: string | null; day: string; kickoff: string | null; slug: string | null;
    outcome: 'home' | 'draw' | 'away'; gap: number; market: [number, number, number]; model: [number, number, number];
  }[];
};

type ClubGame = {
  home: string; away: string; date: string; time?: string | null; tv?: string | null; is_home: boolean; slug: string | null;
  model?: { home: number; draw: number; away: number } | null; hg?: number | null; ag?: number | null; league?: string;
  /** Last result only: its competition and a shoot-out score [home, away] when there was one. */
  competition?: string | null; decided_by?: string | null; pens?: [number, number] | null;
};

/** public.email_personal. */
export type Personal = {
  /** The gameweek whose deadline the squad is from (null: no squad). */
  picks_gw: number | null;
  squad_size?: number | null;
  /** Sections for the squad and watchlist (null: neither). */
  sections: Sections | null;
  club: { name: string; slug: string; next: ClubGame | null; last: ClubGame | null } | null;
};

export type Recipient = {
  /** Include the optional football section. */
  football: boolean;
  /** Personal data; null or empty gives the generic issue. */
  personal?: Personal | null;
  /** Manage/unsubscribe token; null for a test send (links then do nothing). */
  token: string | null;
};

export type BuiltEmail = { subject: string; html: string; text: string; headers: Record<string, string> };

export const unsubscribeUrl = (token: string | null) => `${SITE}/email/unsubscribe?t=${encodeURIComponent(token ?? 'test')}`;
export const manageUrl = (token: string | null) => `${SITE}/email/manage?t=${encodeURIComponent(token ?? 'test')}`;
export const oneClickUrl = (token: string | null) => `${FUNCTIONS_BASE}/email-list?a=one-click&t=${encodeURIComponent(token ?? 'test')}`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (p: number) => `${Math.round(p * 100)}%`;
const money = (n: number) => `£${Number(n).toFixed(1)}m`;
const one = (n: number | null | undefined) => (n == null ? '–' : Number(n).toFixed(1));
const playerUrl = (slug: string | null) => (slug ? `${SITE}/fpl/players/${slug}` : `${SITE}/fpl/start`);
const label = (p: { name: string; team: string | null }) => (p.team ? `${p.name} (${p.team})` : p.name);

/** "Fri 6 Nov, 18:30" in UK time. */
export function ukDeadline(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  return `${day.replace(',', '')}, ${time}`;
}
const ukDay = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');

export function weeklySubject(c: { gw: number; deadline: string | null }, test = false): string {
  const when = c.deadline ? `deadline ${ukDeadline(c.deadline)}` : 'the week ahead';
  return `${test ? '[Test] ' : ''}FPL GW${c.gw}: ${when}`;
}

/** "Fleetwood Town 1-1 Arsenal, Arsenal won 4-3 on penalties"; a level cup tie
 * without a recorded shoot-out says so rather than reading as a plain draw. */
export function resultLine(g: ClubGame): string {
  const score = `${g.home} ${g.hg}-${g.ag} ${g.away}`;
  if (g.pens && g.pens.length === 2) {
    const [hp, ap] = g.pens;
    const winner = hp > ap ? g.home : g.away;
    return `${score}, ${winner} won ${Math.max(hp, ap)}-${Math.min(hp, ap)} on penalties`;
  }
  const cup = !!g.competition && /cup|trophy|shield|playoff|play-off/i.test(g.competition);
  if (g.hg === g.ag && cup) return `${score} after 90 minutes (${g.competition})`;
  return g.competition ? `${score} (${g.competition})` : score;
}

// ---- Player phrases ---------------------------------------------------------
const STATUS: Record<string, string> = { d: 'doubtful', i: 'injured', s: 'suspended', u: 'unavailable', n: 'not in the squad' };
/** "v BOU (H)", "v BOU (H), v CHE (A)" for the gameweek; "no game" for a blank. */
export function fixtureText(f: Facts, gw: number): string {
  const fx = f.fixtures.filter((x) => x.gw === gw);
  return fx.length ? fx.map((x) => `v ${x.opp} (${x.home ? 'H' : 'A'})`).join(', ') : 'no game';
}
const nextFixtures = (f: Facts) => f.fixtures.map((x) => `${x.opp} (${x.home ? 'H' : 'A'})`).join(', ');
const flagText = (f: Facts) => (f.status === 'a' ? null : f.news ?? `${STATUS[f.status] ?? 'flagged'}${f.chance != null ? `, ${f.chance}% chance of playing` : ''}`);
/** "1 goal, 0 assists from 3.4 xG and 0.8 xA in the last 5 GWs (21 pts)" */
export function formText(f: Facts): string | null {
  const l = f.l5;
  if (!l) return null;
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
  return `${n(l.g, 'goal')}, ${n(l.a, 'assist')} from ${one(l.xg)} xG and ${one(l.xa)} xA in the last ${l.gws} GWs (${l.pts} pts)`;
}
const minutesText = (f: Facts) => (f.l5?.m3?.length ? `minutes in the last ${f.l5.m3.length}: ${f.l5.m3.join(', ')}` : null);
const priceMove = (f: Facts) => {
  if (f.week_before == null || Number(f.week_before) === Number(f.price)) return null;
  return `${money(f.week_before)} → ${money(f.price)}`;
};
const tonightText = (f: Facts) =>
  f.tonight ? `likely to ${f.tonight.direction === 'rise' ? 'rise' : 'fall'} tonight${f.tonight.outlook === 'possible' ? ' (possible)' : ''}` : null;

// ---- Blocks: each section is built once as (html, text) ---------------------
type Line = { h: string; t: string };
type Block = { html: string; text: string };
const C = { text: '#1a1a1a', muted: '#555555', bg: '#ffffff', panel: '#f3f5f2', accent: '#1b4332', rule: '#d9ddd6' };

const h2 = (t: string) =>
  `<h2 class="fs-h" style="margin:26px 0 8px;font-size:17px;line-height:1.3;color:${C.accent};font-weight:700">${esc(t)}</h2>`;
const p = (inner: string, muted = false) =>
  `<p class="${muted ? 'fs-m' : 'fs-t'}" style="margin:0 0 10px;font-size:${muted ? 13 : 15}px;line-height:1.5;color:${muted ? C.muted : C.text}">${inner}</p>`;
const a = (href: string, t: string) => `<a class="fs-a" href="${esc(href)}" style="color:${C.accent};text-decoration:underline">${esc(t)}</a>`;
const ul = (items: string[]) =>
  `<ul style="margin:0 0 10px;padding:0 0 0 20px">${items.map((i) => `<li class="fs-t" style="margin:0 0 6px;font-size:15px;line-height:1.45;color:${C.text}">${i}</li>`).join('')}</ul>`;
/** A player's name linked to their page, plus plain text after it. */
const pl = (f: { name: string; team: string | null; slug: string | null }, rest = ''): Line => ({
  h: `${a(playerUrl(f.slug), label(f))}${esc(rest)}`,
  t: `${label(f)}${rest}`,
});
const block = (title: string, lines: Line[], opts: { intro?: string; note?: string; more?: { href: string; label: string } } = {}): Block => ({
  html: h2(title) + (opts.intro ? p(esc(opts.intro), true) : '') + (lines.length ? ul(lines.map((l) => l.h)) : '') +
    (opts.note ? p(esc(opts.note), true) : '') + (opts.more ? p(a(opts.more.href, opts.more.label)) : ''),
  text: [title.toUpperCase(), ...(opts.intro ? [opts.intro] : []), ...lines.map((l) => `- ${l.t}`),
    ...(opts.note ? [opts.note] : []), ...(opts.more ? [`${opts.more.label}: ${opts.more.href}`] : [])].join('\n'),
});

function yourTeam(me: Personal): Block | null {
  const lines: Line[] = [];
  if (me.picks_gw != null) {
    lines.push({ h: esc(`Your FPL squad as at the GW${me.picks_gw} deadline, used throughout this email.`), t: `Your FPL squad as at the GW${me.picks_gw} deadline, used throughout this email.` });
  }
  const cl = me.club;
  if (cl?.next) {
    const g = cl.next;
    const when = `${ukDay(g.date)}${g.time ? ` ${g.time.slice(0, 5)}` : ''}${g.tv ? `, ${g.tv}` : ''}`;
    const odds = g.model
      ? `our model: win ${pct(g.is_home ? g.model.home : g.model.away)}, draw ${pct(g.model.draw)}, lose ${pct(g.is_home ? g.model.away : g.model.home)}`
      : 'no prediction yet';
    const title = `${g.home} v ${g.away}`;
    lines.push({
      h: `<b>${esc(cl.name)} next:</b> ${g.slug ? a(`${SITE}/football/matches/${g.slug}`, title) : esc(title)} (${esc(when)}): ${esc(odds)}`,
      t: `${cl.name} next: ${title} (${when}): ${odds}`,
    });
  }
  if (cl?.last && cl.last.hg != null && cl.last.ag != null) {
    const g = cl.last;
    const line = resultLine(g);
    lines.push({
      h: `<b>${esc(cl.name)} last:</b> ${g.slug ? a(`${SITE}/football/matches/${g.slug}`, line) : esc(line)}, ${esc(ukDay(g.date))}`,
      t: `${cl.name} last: ${line}, ${ukDay(g.date)}`,
    });
  }
  return lines.length ? block('Your team', lines) : null;
}

function captain(s: Sections, gw: number, overall: Facts | null): Block {
  const title = s.personal ? 'Captain, from your squad' : 'Captain';
  const k = s.captain.pick;
  if (!k) return block(title, [], { intro: `Our projections for GW${gw} aren't ready yet.`, more: { href: `${SITE}/fpl`, label: 'Projections on the site' } });
  const why = (f: Facts, alt: boolean) => {
    const bits = [`${one(f.x1)} projected`];
    const start = f.start == null ? null : Number(f.start);
    if (alt && start != null && start < 0.85) bits.push(`but ${pct(1 - start)} chance he doesn't start`);
    else if (start != null) bits.push(`${pct(start)} to start`);
    if (f.p_blank != null) bits.push(`${pct(f.p_blank)} blank chance`);
    return ` ${fixtureText(f, gw)}: ${bits.join(', ')}.`;
  };
  const lines: Line[] = [];
  const pick = pl(k, why(k, false));
  lines.push({ h: `<b>Pick:</b> ${pick.h}`, t: `Pick: ${pick.t}` });
  if (s.captain.alt) {
    const alt = pl(s.captain.alt, why(s.captain.alt, true));
    lines.push({ h: `<b>Alternative:</b> ${alt.h}`, t: `Alternative: ${alt.t}` });
  }
  if (s.personal && overall && overall.id !== k.id) {
    const o = pl(overall, ` on ${one(overall.x1)}.`);
    lines.push({ h: `<b>Our overall pick:</b> ${o.h}`, t: `Our overall pick: ${o.t}` });
  }
  const blank = [k, s.captain.alt].some((f) => f?.p_blank != null);
  return block(title, lines, { note: `Pick: the highest projection among players 85%+ to start.${blank ? ' Blank: 2 points or fewer.' : ''}` });
}

function change(s: Sections): Block | null {
  if (!s.change.length) return null;
  const lines = s.change.map(({ out, in: inn, gain }) => {
    const why = [flagText(out), out.start != null && Number(out.start) < 0.7 ? `${pct(Number(out.start))} to start` : null].filter(Boolean).join('; ');
    const o = pl(out, ` ${money(out.price)}: ${one(out.x5)} projected${why ? ` (${why})` : ''}`);
    const i = pl(inn, ` ${money(inn.price)}: ${one(inn.x5)} (+${one(gain)})`);
    return { h: `${o.h} → ${i.h}`, t: `${o.t} → ${i.t}` };
  });
  return block('Who to think about changing, and to whom', lines, {
    intro: s.personal ? 'From your squad.' : 'Among players owned by 15%+.',
    note: 'Like for like: same position, price within £0.5m, projected points over the next five gameweeks.',
  });
}

function luck(s: Sections): Block | null {
  if (!s.unlucky.length && !s.lucky.length) return null;
  const lines: Line[] = [];
  for (const f of s.unlucky) { const l = pl(f, `: ${formText(f)}`); lines.push({ h: `<b>Unlucky:</b> ${l.h}`, t: `Unlucky: ${l.t}` }); }
  for (const f of s.lucky) { const l = pl(f, `: ${formText(f)}`); lines.push({ h: `<b>Lucky:</b> ${l.h}`, t: `Lucky: ${l.t}` }); }
  return block('Lucky and unlucky', lines, {
    intro: s.luck_scope === 'mine' ? 'Your squad and watchlist.' : 'Players owned by 5%+.',
    note: 'Unlucky: underlying numbers better than the goals and assists. Lucky: goals and assists ahead of them. 1.5+ apart.',
  });
}

function minutes(s: Sections, gw: number): Block | null {
  if (!s.minutes.length) return null;
  const lines = s.minutes.map((f) => {
    const bits = [flagText(f), f.start != null ? `${pct(Number(f.start))} to start GW${gw}` : `no projection for GW${gw}`, minutesText(f)].filter(Boolean);
    return pl(f, `: ${bits.join('; ')}`);
  });
  return block('Minutes risks', lines, {
    intro: s.personal ? 'Your squad: flagged, under 70% to start, or under 45 minutes in a recent game.' : 'Owned by 10%+: flagged, under 70% to start, or under 45 minutes in a recent game.',
    more: { href: `${SITE}/fpl/minutes`, label: 'Minutes outlook for every club' },
  });
}

function watchlist(s: Sections, gw: number): Block | null {
  if (!s.watchlist.length) return null;
  const lines = s.watchlist.map((f) => {
    const bits = [
      `${money(f.price)}${priceMove(f) ? ` (${priceMove(f)} this week)` : ''}`,
      flagText(f),
      f.start != null ? `${pct(Number(f.start))} to start, ${one(f.x1)} projected (${one(f.x5)} over 5 GWs)` : `no projection for GW${gw}`,
      f.fixtures.length ? `next: ${nextFixtures(f)}` : null,
      formText(f),
      tonightText(f),
    ].filter(Boolean);
    return pl(f, `: ${bits.join('; ')}`);
  });
  return block('Your watchlist', lines, {});
}

function prices(s: Sections): Block | null {
  const pr = s.prices;
  const seen = new Set<number>();
  const lines: Line[] = [];
  for (const f of pr.mine) {
    seen.add(f.id);
    const l = pl(f, ` ${priceMove(f)}`);
    lines.push({ h: `<b>Yours:</b> ${l.h}`, t: `Yours: ${l.t}` });
  }
  for (const f of pr.notable.filter((x) => !seen.has(x.id))) {
    const l = pl(f, ` ${priceMove(f)}, ${f.own}% owned`);
    lines.push({ h: `<b>Most-owned mover:</b> ${l.h}`, t: `Most-owned mover: ${l.t}` });
  }
  for (const f of pr.tonight) {
    const l = pl(f, ` ${money(f.price)}: ${tonightText(f)}`);
    lines.push({ h: `<b>Tonight:</b> ${l.h}`, t: `Tonight: ${l.t}` });
  }
  if (!lines.length) return null;
  return block(pr.since ? `Price moves since ${ukDay(pr.since)}` : 'Price moves this week', lines, {
    note: pr.tonight.length ? "Tonight: FPL's own price predictor." : undefined,
    more: { href: `${SITE}/fpl/price-risk`, label: 'All price changes' },
  });
}

function preview(c: WeeklyContent): Block {
  const title = `GW${c.gw} preview`;
  if (c.preview) {
    const url = `${SITE}${c.preview.path}`;
    return { html: h2(title) + p(`${a(url, c.preview.title)}: fixtures, captains and transfers in full.`), text: `${title.toUpperCase()}\n${c.preview.title}: ${url}` };
  }
  const url = `${SITE}/fpl/gameweek`;
  return { html: h2(title) + p(`Not published yet. It will be in the ${a(url, 'gameweek log')}.`), text: `${title.toUpperCase()}\nNot published yet. It will be at ${url}` };
}

function market(c: WeeklyContent): Block {
  const intro = 'The biggest gaps between our model’s probabilities and the betting market’s for the coming games.';
  if (!c.market.length) {
    const m = 'Our model and the market broadly agree on the games we have prices for so far.';
    return { html: h2(MARKET_HEADING) + p(esc(m)) + p(`<b>${esc(MARKET_DISCLAIMER)}</b>`, true), text: `${MARKET_HEADING.toUpperCase()}\n${m}\n${MARKET_DISCLAIMER}` };
  }
  const row = (g: WeeklyContent['market'][number]) => {
    const names = [g.home, 'Draw', g.away];
    const fmt = (ps: number[]) => ps.map((x, i) => `${names[i]} ${pct(x)}`).join(' · ');
    return { when: `${ukDay(g.day)}${g.kickoff ? ` ${g.kickoff}` : ''}${g.league ? ` · ${g.league}` : ''}`, market: fmt(g.market), model: fmt(g.model) };
  };
  const html = h2(MARKET_HEADING) + p(esc(intro)) +
    c.market.map((g) => {
      const r = row(g);
      const title = `${g.home} v ${g.away}`;
      return `<div class="fs-p" style="margin:0 0 10px;padding:10px 12px;background:${C.panel};border-radius:6px">` +
        p(`<b>${g.slug ? a(`${SITE}/football/matches/${g.slug}`, title) : esc(title)}</b> <span class="fs-m" style="color:${C.muted}">${esc(r.when)}</span>`) +
        p(`Market: ${esc(r.market)}<br>Our model: ${esc(r.model)}`) + '</div>';
    }).join('') +
    p(`<b>${esc(MARKET_DISCLAIMER)}</b> These are probabilities, not predictions of the result.`, true);
  const text = `${MARKET_HEADING.toUpperCase()}\n${intro}\n` +
    c.market.map((g) => { const r = row(g); return `${g.home} v ${g.away} (${r.when})\n  Market: ${r.market}\n  Our model: ${r.model}`; }).join('\n') +
    `\n${MARKET_DISCLAIMER} These are probabilities, not predictions of the result.`;
  return { html, text };
}

/** The whole email for one recipient. */
export function buildWeeklyEmail(c: WeeklyContent, r: Recipient, opts: { test?: boolean } = {}): BuiltEmail {
  const subject = weeklySubject(c, opts.test);
  const deadline = c.deadline ? `Deadline ${ukDeadline(c.deadline)} (UK time)` : 'Deadline to be confirmed';
  const s = r.personal?.sections ?? c.sections;
  const mine = r.personal ? yourTeam(r.personal) : null;
  const blocks = [
    mine, captain(s, c.gw, c.sections.captain.pick), change(s), luck(s), minutes(s, c.gw), watchlist(s, c.gw), prices(s),
    preview(c), r.football ? market(c) : null,
  ].filter((b): b is Block => b != null);
  const unsub = unsubscribeUrl(r.token);
  const manage = manageUrl(r.token);
  const testNote = opts.test ? 'Test send to the admin address. The unsubscribe and manage links in this copy do nothing.' : null;

  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(subject)}</title>` +
    `<style>@media (prefers-color-scheme: dark){.fs-body,.fs-wrap{background:#121412 !important}.fs-t,.fs-t li,h1.fs-t{color:#e8ebe6 !important}` +
    `.fs-m{color:#a9b0a6 !important}.fs-h{color:#8fd3a8 !important}.fs-a{color:#8fd3a8 !important}.fs-p{background:#1e231e !important}}</style></head>` +
    `<body class="fs-body" style="margin:0;padding:0;background:${C.bg}">` +
    `<div class="fs-wrap" style="max-width:600px;margin:0 auto;padding:20px 16px;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">` +
    (testNote ? p(`<b>${esc(testNote)}</b>`, true) : '') +
    p('FixtureShark FPL weekly', true) +
    `<h1 class="fs-t" style="margin:0 0 4px;font-size:22px;line-height:1.25;color:${C.text}">Gameweek ${c.gw}</h1>` +
    p(`<b>${esc(deadline)}</b>`) +
    blocks.map((b) => b.html).join('') +
    `<hr style="border:0;border-top:1px solid ${C.rule};margin:28px 0 12px">` +
    p(`You signed up for this at ${a(SITE, 'fixtureshark.com')}. ${a(unsub, 'Unsubscribe')} (one click) · ${a(manage, 'Change what you get')} · ${a(`${SITE}/privacy`, 'Privacy')}`, true) +
    `</div></body></html>`;

  const text = [
    ...(testNote ? [testNote, ''] : []),
    'FixtureShark FPL weekly',
    `GAMEWEEK ${c.gw}`,
    deadline,
    '',
    blocks.map((b) => b.text).join('\n\n'),
    '',
    '--',
    'You signed up for this at fixtureshark.com.',
    `Unsubscribe (one click): ${unsub}`,
    `Change what you get: ${manage}`,
    `Privacy: ${SITE}/privacy`,
  ].join('\n');

  return {
    subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${oneClickUrl(r.token)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

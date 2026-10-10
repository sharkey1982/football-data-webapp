// Loads the frozen snapshot files and turns them into "facts": one value per
// source id (e.g. P12.xpts = Saka's projected GW6 points). Every number a
// model may use reaches it through one of these ids, so an answer's numbers
// can be traced back and checked exactly.
//
// Nothing here touches the network or the database.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAP = join(ROOT, 'fixtures', 'snapshots');

export const TEAM_NAMES = {
  ARS: 'Arsenal', AVL: 'Aston Villa', BHA: 'Brighton', BOU: 'Bournemouth', BRE: 'Brentford',
  CHE: 'Chelsea', COV: 'Coventry', CRY: 'Crystal Palace', EVE: 'Everton', FUL: 'Fulham',
  HUL: 'Hull', IPS: 'Ipswich', LEE: 'Leeds', LIV: 'Liverpool', MCI: 'Man City',
  MUN: 'Man United', NEW: 'Newcastle', NFO: "Nott'm Forest", SUN: 'Sunderland', TOT: 'Tottenham',
};

const STATUS = { a: 'available', d: 'doubtful', i: 'injured', s: 'suspended', u: 'unavailable', n: 'not available' };

function readPsv(name) {
  return readFileSync(join(SNAP, 'raw', name), 'utf8').replace(/\n$/, '').split('\n').map((l) => l.split('|'));
}

const num = (s) => (s === '' || s == null ? null : Number(s));

let cache = null;
export function loadSnapshot() {
  if (cache) return cache;
  const players = readPsv('gw6_players.psv').map((c) => ({
    id: Number(c[0]), name: c[1], slug: c[2], team: c[3], pos: c[4], price: num(c[5]), status: c[6],
    chance: num(c[7]), own: num(c[8]), start: num(c[9]), xmins: num(c[10]), xg: num(c[11]), xa: num(c[12]),
    cs: num(c[13]), xpts: num(c[14]), season_pts: num(c[15]), season_mins: num(c[16]), fixture_id: num(c[17]), news: c[18] ?? '',
  }));
  const fixtures = readPsv('gw6_10_fixtures.psv').map((c) => ({
    gw: num(c[0]), id: num(c[1]), home: c[2], away: c[3], fdr_home: num(c[4]), fdr_away: num(c[5]),
    mkt_home: num(c[6]), mkt_away: num(c[7]), dc_home: num(c[8]), dc_away: num(c[9]), date: c[10],
  }));
  const articles = JSON.parse(readFileSync(join(SNAP, 'articles.json'), 'utf8'));
  cache = { players, fixtures, articles };
  return cache;
}

export function player(name, team) {
  const { players } = loadSnapshot();
  const hits = players.filter((p) => p.name === name && (!team || p.team === team));
  if (hits.length !== 1) throw new Error(`player ${name}${team ? ` (${team})` : ''}: ${hits.length} matches in snapshot`);
  return hits[0];
}

export function fixtureFor(p) {
  const f = loadSnapshot().fixtures.find((x) => x.id === p.fixture_id);
  if (!f) throw new Error(`no fixture ${p.fixture_id} for ${p.name}`);
  const home = f.home === p.team;
  return { ...f, home_side: home, opponent: home ? f.away : f.home };
}

// ---------------------------------------------------------------- context
// A Context collects labelled values and renders them as text. Each value
// has a stable id; the same object is used by the checks to look ids up.

const PLAYER_FIELDS = {
  price: ['price (£m)', (p) => p.price],
  xpts: ['projected FPL points, GW6 (model estimate)', (p) => p.xpts],
  start: ['probability of starting, GW6 (model estimate)', (p) => p.start],
  xmins: ['expected minutes, GW6 (model estimate)', (p) => p.xmins],
  xg: ['expected goals, GW6 (model estimate)', (p) => p.xg],
  xa: ['expected assists, GW6 (model estimate)', (p) => p.xa],
  cs: ['clean-sheet probability, GW6 (model estimate)', (p) => p.cs],
  own: ['selected by (% of FPL managers)', (p) => p.own],
  chance: ['FPL chance of playing this round (%)', (p) => p.chance],
  season_pts: ['FPL points this season (observed)', (p) => p.season_pts],
  season_mins: ['minutes this season (observed)', (p) => p.season_mins],
};

export class Context {
  constructor() { this.sections = []; this.values = new Map(); }

  add(id, value, label) {
    if (value == null) return;
    if (this.values.has(id) && this.values.get(id).value !== value) throw new Error(`duplicate id ${id}`);
    this.values.set(id, { value, label });
  }

  section(title, lines) { this.sections.push({ title, lines }); return this; }

  players(title, ps, fields) {
    const lines = [];
    for (const p of ps) {
      const fx = fixtureFor(p);
      const status = STATUS[p.status] ?? p.status;
      lines.push(`${p.name} (FPL id ${p.id}, slug ${p.slug}): ${TEAM_NAMES[p.team]} ${p.pos}, GW6 ${fx.home_side ? 'home to' : 'away at'} ${TEAM_NAMES[fx.opponent]}, FPL status ${status}${p.news ? `, news: "${p.news}"` : ''}`);
      for (const f of fields) {
        const [label, get] = PLAYER_FIELDS[f];
        const v = get(p);
        if (v == null) { lines.push(`  [P${p.id}.${f}] ${label}: not recorded`); continue; }
        this.add(`P${p.id}.${f}`, v, `${p.name} ${label}`);
        lines.push(`  [P${p.id}.${f}] ${label}: ${v}`);
      }
    }
    return this.section(title, lines);
  }

  fixtures(title, fxs, { fdr = true, market = true, dc = true } = {}) {
    const lines = [];
    for (const f of fxs) {
      const parts = [];
      const put = (key, v, label) => { const id = `F${f.id}.${key}`; this.add(id, v, `GW${f.gw} ${f.home} v ${f.away} ${label}`); parts.push(`[${id}] ${label} ${v}`); };
      if (fdr) { put('fdr_home', f.fdr_home, `FDR for ${f.home}`); put('fdr_away', f.fdr_away, `FDR for ${f.away}`); }
      if (market) { put('mkt_home', f.mkt_home, `market goals ${f.home}`); put('mkt_away', f.mkt_away, `market goals ${f.away}`); }
      if (dc) { put('dc_home', f.dc_home, `Dixon-Coles goals ${f.home}`); put('dc_away', f.dc_away, `Dixon-Coles goals ${f.away}`); }
      lines.push(`GW${f.gw} ${f.date} ${TEAM_NAMES[f.home]} v ${TEAM_NAMES[f.away]}: ${parts.join('; ')}`);
    }
    return this.section(title, lines);
  }

  // A flat list of [id, value, label] from article data.
  items(title, rows, note) {
    const lines = note ? [note] : [];
    for (const [id, value, label] of rows) { this.add(id, value, label); lines.push(`  [${id}] ${label}: ${value}`); }
    return this.section(title, lines);
  }

  render() {
    return this.sections.map((s) => `## ${s.title}\n${s.lines.join('\n')}`).join('\n\n');
  }

  toJSON() { return Object.fromEntries([...this.values].map(([k, v]) => [k, v.value])); }
}

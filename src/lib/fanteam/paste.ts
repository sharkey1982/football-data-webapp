// ============================================================================
// src/lib/fanteam/paste.ts
//
// Turns text copied from FanTeam's player price list into rows, and matches
// each row to an FPL player. Prices only ever arrive this way (Chris copies
// the list in his own browser); nothing here talks to FanTeam.
//
// The parser is deliberately layout-tolerant: it accepts one player per line
// (tabs, commas or runs of spaces) or a player spread over several lines,
// closing a record at each price. Every parse is previewed before saving.
// ============================================================================

import type { Pos } from './scoring';

export const PARSER_VERSION = 'v1';

export type ParsedRow = {
  row_no: number;
  name_raw: string;
  club_raw: string;
  position: Pos | null;
  price_m: number | null;
  issues: string[];
};

export type TeamRef = { team_id: number; team_name: string };

const POS_WORDS: Record<string, Pos> = {
  gk: 'GK', gkp: 'GK', gl: 'GK', goalkeeper: 'GK', goalkeepers: 'GK', keeper: 'GK',
  def: 'DEF', d: 'DEF', defender: 'DEF', defenders: 'DEF',
  mid: 'MID', m: 'MID', midfielder: 'MID', midfielders: 'MID',
  fwd: 'FWD', fw: 'FWD', f: 'FWD', st: 'FWD', forward: 'FWD', forwards: 'FWD', striker: 'FWD',
};

/** Common short and informal Premier League club names -> words that appear
 * in the canonical name. Unknown clubs fall through to a manual fix. */
const CLUB_ALIASES: Record<string, string> = {
  ars: 'arsenal', avl: 'aston villa', villa: 'aston villa', bou: 'bournemouth', bre: 'brentford',
  bha: 'brighton', bri: 'brighton', bur: 'burnley', che: 'chelsea', cry: 'crystal palace', palace: 'crystal palace',
  eve: 'everton', ful: 'fulham', ips: 'ipswich', lee: 'leeds', lei: 'leicester', liv: 'liverpool',
  mci: 'manchester city', 'man city': 'manchester city', 'man c': 'manchester city',
  mun: 'manchester united', 'man utd': 'manchester united', 'man united': 'manchester united', 'man u': 'manchester united',
  new: 'newcastle', nfo: 'nottingham forest', "nott'm forest": 'nottingham forest', 'notts forest': 'nottingham forest', forest: 'nottingham forest',
  sou: 'southampton', sun: 'sunderland', tot: 'tottenham', spurs: 'tottenham', whu: 'west ham', wol: 'wolverhampton', wolves: 'wolverhampton',
  shu: 'sheffield united', lut: 'luton', boro: 'middlesbrough', cov: 'coventry', nor: 'norwich', wat: 'watford', wba: 'west brom',
};

export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’`]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Resolve a FanTeam club string to a team; null if unknown. */
export function resolveClub(raw: string, teams: TeamRef[], manual: Map<string, number>): number | null {
  const k = norm(raw);
  if (!k) return null;
  if (manual.has(k)) return manual.get(k)!;
  const target = (CLUB_ALIASES[k] ?? k).replace(/^afc /, '').replace(/ (fc|afc)$/, '');
  const exact = teams.find((t) => norm(t.team_name) === target);
  if (exact) return exact.team_id;
  // A short form that starts the full name ("Tottenham" ~ "Tottenham Hotspur",
  // "Brighton" ~ "Brighton & Hove Albion"), never a longer text that merely
  // begins with a club name ("Arsenal Tierney") or contains one.
  const hits = teams.filter((t) => {
    const n = norm(t.team_name);
    return n.startsWith(target + ' ');
  });
  return hits.length === 1 ? hits[0].team_id : null;
}

function findPrice(text: string): { value: number; match: string } | null {
  // Prefer an explicit currency or "m" suffix; otherwise a 3.0-20.0 decimal.
  const strong = /£\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:m|mil|million)?\b|(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:m|mil|million)\b/i.exec(text);
  if (strong) {
    const v = parseFloat((strong[1] ?? strong[2]).replace(',', '.'));
    if (v >= 3 && v <= 25) return { value: v, match: strong[0] };
  }
  const tokens = text.split(/[\s\t,;|]+/);
  for (const t of tokens) {
    const m = /^(\d{1,2}[.,]\d)$/.exec(t);
    if (m) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (v >= 3 && v <= 25) return { value: v, match: t };
    }
  }
  return null;
}

function findPosition(text: string): { pos: Pos; match: string } | null {
  for (const t of text.split(/[\s\t,;|()]+/)) {
    const p = POS_WORDS[t.toLowerCase()];
    // Single letters only count when upper-case and standalone.
    if (p && (t.length > 1 || /^[DMF]$/.test(t))) return { pos: p, match: t };
  }
  return null;
}

function findClub(text: string, teams: TeamRef[], manual: Map<string, number>): { team_id: number; match: string } | null {
  const fields = text.split(/\t|\s{2,}|,|;|\|/).map((f) => f.trim()).filter(Boolean);
  for (const f of fields) {
    const id = resolveClub(f, teams, manual);
    if (id != null) return { team_id: id, match: f };
  }
  // Fall back to scanning words and word pairs (handles single-space layouts).
  const words = text.split(/\s+/);
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const phrase = words.slice(i, i + n).join(' ');
      if (/\d/.test(phrase)) continue;
      const k = norm(phrase);
      if (k.length < 3 || POS_WORDS[k]) continue;
      const id = resolveClub(phrase, teams, manual);
      if (id != null && (CLUB_ALIASES[k] || teams.some((t) => norm(t.team_name) === k || norm(t.team_name).startsWith(k + ' ') || norm(t.team_name).split(' ')[0] === k))) {
        return { team_id: id, match: phrase };
      }
    }
  }
  return null;
}

/** Split pasted text into records: one per line when most lines carry a
 * price, otherwise group lines up to and including each price line. */
function records(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const priced = lines.filter((l) => findPrice(l));
  if (priced.length >= lines.length * 0.6) return priced;
  const out: string[] = [];
  let buf: string[] = [];
  for (const l of lines) {
    buf.push(l);
    if (findPrice(l)) { out.push(buf.join('\t')); buf = []; }
    if (buf.length > 8) buf = buf.slice(-4); // drop headers / noise
  }
  return out;
}

const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Remove one token: a whole field if one equals it, else a whole word —
 * never a substring of something longer (a club inside a player's name). */
function removeToken(text: string, token: string): string {
  const sep = '\\t|\\s{2,}|,|;|\\|';
  const field = new RegExp(`(^|${sep})\\s*${esc(token)}\\s*(?=$|${sep})`);
  if (field.test(text)) return text.replace(field, '$1 ');
  return text.replace(new RegExp(`(^|[\\s(·•-])${esc(token)}(?=$|[\\s)·•-])`), '$1 ');
}

export function parsePaste(text: string, teams: TeamRef[], manualClubs: Map<string, number>): ParsedRow[] {
  return records(text).map((rec, idx) => {
    const issues: string[] = [];
    const price = findPrice(rec);
    let rest = rec;
    if (price) rest = rest.replace(price.match, ' ');
    const pos = findPosition(rest);
    if (pos) rest = removeToken(rest, pos.match);
    const club = findClub(rest, teams, manualClubs);
    let clubRaw = '';
    if (club) { clubRaw = club.match; rest = removeToken(rest, club.match); }
    // Name: longest remaining field with letters, no digits/percent.
    const fields = rest.split(/\t|\s{2,}|,|;|\|/).map((f) => f.trim())
      .filter((f) => /[A-Za-zÀ-ÿ]/.test(f) && !/%/.test(f) && !/^[£\d.,+\-\s]+[a-z]{0,3}$/i.test(f));
    const name = fields.sort((a, b) => b.length - a.length)[0] ?? rest.replace(/[\d.%£]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!price) issues.push('no price');
    if (!pos) issues.push('no position');
    if (!club) issues.push('club not recognised');
    if (!name) issues.push('no name');
    if (!club && name) {
      // Keep whatever is left as the raw club text for the manual fix.
      clubRaw = fields.filter((f) => f !== name).join(' ');
    }
    return { row_no: idx + 1, name_raw: name, club_raw: clubRaw, position: pos?.pos ?? null, price_m: price?.value ?? null, issues };
  });
}

// ---------------------------------------------------------------------------
// Player matching
// ---------------------------------------------------------------------------

export type FplRef = { fpl_code: number; team_id: number; element_type: number; web_name: string; first_name: string; second_name: string };
export type Match = { fpl_code: number | null; method: 'manual' | 'exact' | 'surname' | 'initial' | 'web_name' | 'none'; candidates: number };

const POS_TO_ET: Record<Pos, number> = { GK: 1, DEF: 2, MID: 3, FWD: 4 };

export function nameKey(name: string): string {
  return norm(name);
}

export function matchPlayer(
  name: string, teamId: number | null, pos: Pos | null, fpl: FplRef[], manual: Map<string, number | null>,
): Match {
  if (teamId == null) return { fpl_code: null, method: 'none', candidates: 0 };
  const key = nameKey(name);
  const mk = `${key}|${teamId}`;
  if (manual.has(mk)) return { fpl_code: manual.get(mk) ?? null, method: 'manual', candidates: 1 };
  const squad = fpl.filter((p) => p.team_id === teamId);
  const pick = (list: FplRef[], method: Match['method']): Match | null => {
    if (list.length === 1) return { fpl_code: list[0].fpl_code, method, candidates: 1 };
    if (list.length > 1 && pos) {
      const same = list.filter((p) => p.element_type === POS_TO_ET[pos]);
      if (same.length === 1) return { fpl_code: same[0].fpl_code, method, candidates: list.length };
    }
    return null;
  };
  const full = (p: FplRef) => norm(`${p.first_name} ${p.second_name}`);
  const tokens = key.split(' ');
  const last = tokens[tokens.length - 1];

  return pick(squad.filter((p) => full(p) === key), 'exact')
    ?? pick(squad.filter((p) => norm(p.web_name) === key), 'web_name')
    ?? (tokens.length >= 2 && tokens[0].length === 1
      ? pick(squad.filter((p) => norm(p.first_name).startsWith(tokens[0]) && norm(p.second_name).endsWith(tokens.slice(1).join(' '))), 'initial')
      : null)
    ?? pick(squad.filter((p) => {
      const sec = norm(p.second_name).split(' ');
      return sec[sec.length - 1] === last || norm(p.web_name) === last;
    }), 'surname')
    ?? pick(squad.filter((p) => full(p).includes(key) || key.includes(norm(p.web_name))), 'surname')
    ?? { fpl_code: null, method: 'none', candidates: squad.length };
}

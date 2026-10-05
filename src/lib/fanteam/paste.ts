// ============================================================================
// src/lib/fanteam/paste.ts
//
// Turns text copied from FanTeam's player price list into rows, and matches
// each row to an FPL player. Prices only ever arrive this way (Chris copies
// the list in his own browser); nothing here talks to FanTeam.
//
// FanTeam's own player export (header: Tournament, PlayerID, Name, FName,
// Club, Lineup, Position, Price; tab or comma separated) is read by column.
// Anything else falls back to a layout-tolerant reader: one player per line
// (tabs, commas or runs of spaces) or a player spread over several lines,
// closing a record at each price. Every parse is previewed before saving.
// ============================================================================

import type { Pos } from './scoring';

export const PARSER_VERSION = 'v2';

export type ParsedRow = {
  row_no: number;
  name_raw: string;
  club_raw: string;
  position: Pos | null;
  price_m: number | null;
  issues: string[];
  /** From FanTeam's export only. */
  fanteam_player_id?: number | null;
  first_name?: string | null;
  surname?: string | null;
  lineup_status?: string | null;
  tournament?: string | null;
};

export type TeamRef = { team_id: number; team_name: string };

const POS_WORDS: Record<string, Pos> = {
  gk: 'GK', gkp: 'GK', gl: 'GK', goalkeeper: 'GK', goalkeepers: 'GK', keeper: 'GK',
  def: 'DEF', d: 'DEF', defender: 'DEF', defenders: 'DEF',
  mid: 'MID', m: 'MID', midfielder: 'MID', midfielders: 'MID',
  fwd: 'FWD', fw: 'FWD', f: 'FWD', st: 'FWD', forward: 'FWD', forwards: 'FWD', striker: 'FWD',
};

/** Club codes and informal names -> the forms a club's canonical name may
 * take (the database uses e.g. "Man City", "Man United", "Tottenham",
 * "Nott'm Forest", "Coventry", "Hull"). FanTeam's codes are mostly FPL's,
 * except CVC for Coventry. Unknown clubs fall through to a manual fix. */
const CLUB_ALIASES: Record<string, string[]> = {
  ars: ['arsenal'], avl: ['aston villa'], villa: ['aston villa'], bou: ['bournemouth'], bre: ['brentford'],
  bha: ['brighton', 'brighton and hove albion'], bri: ['brighton'], bur: ['burnley'], che: ['chelsea'],
  cry: ['crystal palace'], palace: ['crystal palace'], eve: ['everton'], ful: ['fulham'],
  ips: ['ipswich', 'ipswich town'], lee: ['leeds', 'leeds united'], lei: ['leicester', 'leicester city'], liv: ['liverpool'],
  mci: ['man city', 'manchester city'], 'man city': ['manchester city'], 'manchester city': ['man city'],
  mun: ['man united', 'manchester united', 'man utd'], 'man utd': ['man united', 'manchester united'],
  'man united': ['manchester united'], 'manchester united': ['man united'],
  new: ['newcastle', 'newcastle united'], nfo: ["nott'm forest", 'nottingham forest'], "nott'm forest": ['nottingham forest'],
  'nottingham forest': ["nott'm forest"], forest: ["nott'm forest", 'nottingham forest'],
  sou: ['southampton'], sun: ['sunderland'], tot: ['tottenham', 'tottenham hotspur', 'spurs'], spurs: ['tottenham', 'tottenham hotspur'],
  'tottenham hotspur': ['tottenham'], whu: ['west ham', 'west ham united'], wol: ['wolves', 'wolverhampton wanderers'],
  wolves: ['wolverhampton wanderers'], shu: ['sheffield united'], lut: ['luton', 'luton town'], boro: ['middlesbrough'],
  cov: ['coventry', 'coventry city'], cvc: ['coventry', 'coventry city'], 'coventry city': ['coventry'],
  hul: ['hull', 'hull city'], 'hull city': ['hull'], 'ipswich town': ['ipswich'],
  nor: ['norwich', 'norwich city'], wat: ['watford'], wba: ['west brom', 'west bromwich albion'],
};

/** Letters NFD doesn't decompose (Nørgaard, Groß, Kadıoğlu, Petrović, Łukasz). */
const FOLD: Record<string, string> = { 'ø': 'o', 'Ø': 'o', 'ß': 'ss', 'ı': 'i', 'đ': 'd', 'Đ': 'd', 'ł': 'l', 'Ł': 'l', 'æ': 'ae', 'Æ': 'ae', 'œ': 'oe', 'þ': 'th' };

export function norm(s: string): string {
  return s.replace(/[øØßıđĐłŁæÆœþ]/g, (c) => FOLD[c] ?? c)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[’`]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Resolve a FanTeam club string to a team; null if unknown. */
export function resolveClub(raw: string, teams: TeamRef[], manual: Map<string, number>): number | null {
  const k = norm(raw);
  if (!k) return null;
  if (manual.has(k)) return manual.get(k)!;
  const strip = (v: string) => v.replace(/^afc /, '').replace(/ (fc|afc)$/, '');
  const targets = [strip(k), ...(CLUB_ALIASES[k] ?? []).map(strip)];
  for (const target of targets) {
    const exact = teams.find((t) => norm(t.team_name) === target);
    if (exact) return exact.team_id;
  }
  // A short form that starts the full name ("Tottenham" ~ "Tottenham Hotspur",
  // "Brighton" ~ "Brighton & Hove Albion"), never a longer text that merely
  // begins with a club name ("Arsenal Tierney") or contains one.
  for (const target of targets) {
    const hits = teams.filter((t) => norm(t.team_name).startsWith(target + ' '));
    if (hits.length === 1) return hits[0].team_id;
  }
  return null;
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

// ---------------------------------------------------------------------------
// FanTeam's own export
// ---------------------------------------------------------------------------

const EXPORT_COLS = ['playerid', 'name', 'club', 'position', 'price'];

/** Read FanTeam's player export by its header; null if the text isn't one. */
export function parseExport(text: string, teams: TeamRef[], manualClubs: Map<string, number>): ParsedRow[] | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return null;
  const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const split = (l: string) => splitDelimited(l, delim);
  const header = split(lines[0]).map((h) => h.trim().toLowerCase());
  if (!EXPORT_COLS.every((c) => header.includes(c))) return null;
  const col = (name: string) => header.indexOf(name);
  const iId = col('playerid'), iName = col('name'), iF = col('fname'), iClub = col('club'),
    iLine = col('lineup'), iPos = col('position'), iPrice = col('price'), iT = col('tournament');

  return lines.slice(1).map((line, idx) => {
    const f = split(line).map((v) => v.trim());
    const surname = f[iName] ?? '';
    const first = iF >= 0 ? f[iF] ?? '' : '';
    // Mononyms come as e.g. Name "Savinho", FName "Savinho".
    const name = !first || norm(first) === norm(surname) ? surname : `${first} ${surname}`;
    const clubRaw = f[iClub] ?? '';
    const pos = POS_WORDS[(f[iPos] ?? '').toLowerCase()] ?? null;
    const priceNum = parseFloat((f[iPrice] ?? '').replace(',', '.').replace(/[£m]/gi, ''));
    const price = Number.isFinite(priceNum) && priceNum > 0 ? priceNum : null;
    const idNum = Number(f[iId]);
    const issues: string[] = [];
    if (!surname) issues.push('no name');
    if (!pos) issues.push('no position');
    if (price == null) issues.push('no price');
    if (resolveClub(clubRaw, teams, manualClubs) == null) issues.push('club not recognised');
    return {
      row_no: idx + 1, name_raw: name, club_raw: clubRaw, position: pos, price_m: price, issues,
      fanteam_player_id: Number.isFinite(idNum) && idNum > 0 ? idNum : null,
      first_name: first || null, surname: surname || null,
      lineup_status: iLine >= 0 ? (f[iLine] || null) : null,
      tournament: iT >= 0 ? (f[iT] || null) : null,
    };
  });
}

/** Split one delimited line, honouring double quotes. */
function splitDelimited(line: string, delim: string): string[] {
  if (delim === '\t') return line.split('\t');
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === delim && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parsePaste(text: string, teams: TeamRef[], manualClubs: Map<string, number>): ParsedRow[] {
  const exp = parseExport(text, teams, manualClubs);
  if (exp) return exp;
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
  parts?: { first?: string | null; surname?: string | null },
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

  // With FanTeam's separate first name and surname: the surname must end
  // FPL's surname or be its web name, then the first name breaks ties.
  const byParts = (): Match | null => {
    const sur = parts?.surname ? norm(parts.surname) : '';
    if (!sur) return null;
    const first = parts?.first ? norm(parts.first) : '';
    const hit = squad.filter((p) => {
      const sec = norm(p.second_name), web = norm(p.web_name).replace(/^[a-z]{1,2} /, '');
      return sec === sur || sec.endsWith(' ' + sur) || sec.startsWith(sur + ' ') || web === sur || norm(p.web_name) === sur;
    });
    const r = pick(hit, 'surname');
    if (r) return r;
    if (hit.length > 1 && first) {
      const f = hit.filter((p) => norm(p.first_name).split(' ')[0] === first.split(' ')[0] || norm(p.first_name).startsWith(first[0]) && first.length === 1);
      return pick(f, 'surname');
    }
    return null;
  };

  return pick(squad.filter((p) => full(p) === key), 'exact')
    ?? byParts()
    ?? pick(squad.filter((p) => norm(p.web_name) === key), 'web_name')
    ?? (tokens.length >= 2 && tokens[0].length === 1
      ? pick(squad.filter((p) => norm(p.first_name).startsWith(tokens[0]) && norm(p.second_name).endsWith(tokens.slice(1).join(' '))), 'initial')
      : null)
    ?? pick(squad.filter((p) => {
      const sec = norm(p.second_name).split(' ');
      return sec[sec.length - 1] === last || norm(p.web_name) === last;
    }), 'surname')
    ?? pick(squad.filter((p) => full(p).includes(key) || key.includes(norm(p.web_name))), 'surname')
    ?? nearSurname()
    ?? { fpl_code: null, method: 'none', candidates: squad.length };

  // Last resort: one letter different in the surname (Yarmolyuk ~ Yarmoliuk),
  // same club and position, and only if exactly one player fits.
  function nearSurname(): Match | null {
    const sur = norm(parts?.surname ?? last);
    if (sur.length < 5 || !pos) return null;
    const hit = squad.filter((p) => p.element_type === POS_TO_ET[pos]).filter((p) => {
      const cands = [norm(p.web_name), ...norm(p.second_name).split(' ')];
      return cands.some((c) => c.length >= 5 && editDistance(c, sur) === 1);
    });
    return hit.length === 1 ? { fpl_code: hit[0].fpl_code, method: 'surname', candidates: 1 } : null;
  }
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

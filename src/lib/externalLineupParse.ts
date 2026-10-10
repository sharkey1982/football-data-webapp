// ============================================================================
// src/lib/externalLineupParse.ts
//
// Reads predicted line-ups pasted from Fantasy Football Scout (or read off a
// screenshot) for /admin/lineup-compare. Typical text:
//
//   Arsenal: Raya; Timber, Saliba, Gabriel, Calafiori; Rice, Lewis-Skelly;
//   Saka, Odegaard, Eze; Havertz
//   Aston Villa: Martinez; Cash, ...
//
// A line starting with a club name (with or without a colon) starts that
// club's block; names follow, split on commas, semicolons, slashes and new
// lines. Without any club name, the whole text is for the club chosen on
// the page. Names are matched to that club's squad by FPL web name,
// surname or full name, ignoring accents and punctuation, then by a small
// spelling distance; anything unmatched or ambiguous is returned for the
// admin to fix rather than guessed.
// ============================================================================

export type SquadPlayer = { fpl_player_id: number; web_name: string; first_name?: string | null; second_name?: string | null };
export type ClubRef = { team_id: number; names: string[] };
export type ParsedClub = { team_id: number; matched: SquadPlayer[]; unmatched: { text: string; options: SquadPlayer[] }[] };

export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Extra names clubs go by in line-up articles. */
const CLUB_ALIASES: Record<string, string[]> = {
  'manchester united': ['man utd', 'man united', 'manchester utd', 'united'],
  'manchester city': ['man city', 'city'],
  tottenham: ['spurs', 'tottenham hotspur'],
  'nottingham forest': ["nott'm forest", 'nottm forest', 'forest'],
  'wolverhampton': ['wolves'],
  'aston villa': ['villa'],
  'crystal palace': ['palace'],
  brighton: ['brighton and hove albion', 'brighton & hove albion'],
  newcastle: ['newcastle united'],
  'west ham': ['west ham united'],
  leeds: ['leeds united'],
  'coventry': ['coventry city'],
  hull: ['hull city'],
  ipswich: ['ipswich town'],
};

export function clubNames(names: string[]): string[] {
  const out = new Set<string>();
  for (const n of names) {
    if (!n) continue;
    out.add(n.toLowerCase());
    for (const [key, extra] of Object.entries(CLUB_ALIASES)) {
      if (fold(key) === fold(n)) extra.forEach((e) => out.add(e));
    }
  }
  return [...out];
}

/** The club a line starts with, and the rest of the line. Longest name wins ("Man City" before "City"). */
function clubAtStart(line: string, clubs: ClubRef[]): { team_id: number; rest: string } | null {
  const l = line.trim().toLowerCase();
  let best: { team_id: number; len: number } | null = null;
  for (const c of clubs) {
    for (const name of c.names) {
      const n = name.toLowerCase();
      if ((l === n || l.startsWith(n + ':') || l.startsWith(n + ' ') || l.startsWith(n + ' -') || l.startsWith(n + '\t')) && (!best || n.length > best.len)) {
        // A bare one-word alias ("city", "united", "villa") only counts with a colon or alone on the line.
        const short = !n.includes(' ') && n.length <= 6 && ['city', 'united', 'villa', 'forest', 'palace'].includes(n);
        if (short && !(l === n || l.startsWith(n + ':'))) continue;
        best = { team_id: c.team_id, len: n.length };
      }
    }
  }
  if (!best) return null;
  return { team_id: best.team_id, rest: line.trim().slice(best.len).replace(/^[\s:–-]+/, '') };
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function keys(p: SquadPlayer): string[] {
  const k = [fold(p.web_name)];
  if (p.second_name) k.push(fold(p.second_name));
  if (p.first_name && p.second_name) k.push(fold(`${p.first_name}${p.second_name}`));
  // "J.Timber" -> "timber"; "Bruno G." -> "bruno"
  const parts = p.web_name.split(/[.\s]+/).filter((x) => x.length > 2);
  parts.forEach((x) => k.push(fold(x)));
  return [...new Set(k.filter(Boolean))];
}

/** Match one written name to the squad: exact key, then a key it ends with, then spelling distance <= 2. */
export function matchName(text: string, squad: SquadPlayer[]): { player: SquadPlayer | null; options: SquadPlayer[] } {
  const t = fold(text);
  if (t.length < 2) return { player: null, options: [] };
  const exact = squad.filter((p) => keys(p).includes(t));
  if (exact.length === 1) return { player: exact[0], options: [] };
  if (exact.length > 1) return { player: null, options: exact };
  // A key the written name ends with ("timber" in "jurrientimber"), or one it begins
  // (a first name + part of a long surname: "Bruno Guimaraes").
  const ends = squad.filter((p) => keys(p).some((k) => Math.min(k.length, t.length) >= 4 && (t.endsWith(k) || k.endsWith(t) || (t.length >= 8 && k.startsWith(t)))));
  if (ends.length === 1) return { player: ends[0], options: [] };
  if (ends.length > 1) return { player: null, options: ends };
  if (t.length >= 4) {
    const near = squad
      .map((p) => ({ p, d: Math.min(...keys(p).map((k) => lev(t, k))) }))
      .filter((x) => x.d <= (t.length >= 7 ? 2 : 1))
      .sort((a, b) => a.d - b.d);
    if (near.length === 1 || (near.length > 1 && near[0].d < near[1].d)) return { player: near[0].p, options: [] };
    if (near.length > 1) return { player: null, options: near.map((x) => x.p) };
  }
  return { player: null, options: [] };
}

const NOISE = /^(gk|def|mid|fwd|subs?|bench|formation|\d[\d-]*|captain|vc|c|predicted|line-?up|xi)$/i;

function splitNames(text: string): string[] {
  return text
    .replace(/\((?:c|vc|gk|captain)\)/gi, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,;/|\n]+|\s[–—-]\s/)
    .map((s) => s.replace(/^\s*\d+[.)]?\s*/, '').replace(/^(gk|def|mid|fwd)\s*:\s*/i, '').trim())
    .filter((s) => s.length > 1 && !NOISE.test(s));
}

/**
 * Parse pasted text into club line-ups. `defaultTeamId` is used when the
 * text names no club. Squads keyed by team_id.
 */
export function parseLineups(text: string, clubs: ClubRef[], squads: Map<number, SquadPlayer[]>, defaultTeamId: number | null): ParsedClub[] {
  const blocks = new Map<number, string[]>();
  let current: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const head = clubAtStart(raw, clubs);
    if (head) {
      current = head.team_id;
      if (!blocks.has(current)) blocks.set(current, []);
      if (head.rest) blocks.get(current)!.push(head.rest);
      continue;
    }
    const target = current ?? defaultTeamId;
    if (target == null) continue;
    if (!blocks.has(target)) blocks.set(target, []);
    blocks.get(target)!.push(raw);
  }
  const out: ParsedClub[] = [];
  for (const [team_id, lines] of blocks) {
    const squad = squads.get(team_id) ?? [];
    const matched: SquadPlayer[] = [];
    const unmatched: ParsedClub['unmatched'] = [];
    for (const name of splitNames(lines.join('\n'))) {
      const m = matchName(name, squad);
      if (m.player) {
        if (!matched.some((p) => p.fpl_player_id === m.player!.fpl_player_id)) matched.push(m.player);
      } else {
        unmatched.push({ text: name, options: m.options });
      }
    }
    out.push({ team_id, matched, unmatched });
  }
  return out;
}

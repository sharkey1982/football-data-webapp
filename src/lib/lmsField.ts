// ============================================================================
// src/lib/lmsField.ts
//
// The real field in a Last Man Standing game, from the pick counts SportSkins
// emails after each deadline ("Arsenal 1802, Chelsea 843, ..."). Pure
// functions, no I/O.
//
//   parsePickCounts  pasted email text → counts per team (aliases: Man Utd,
//                    BHA, Spurs, Nottm Forest, FPL short codes, ...)
//   encode/decode    one URL parameter per round: f<gw>=<teamId>:<n>,...
//   fieldState       entrants, survivors (known or expected), and the share
//                    of the surviving field that has used each team
//   fitBeta          the field's favouritism (picks ∝ unused × exp(β × win
//                    chance)), fitted to every pasted round by maximum
//                    likelihood
//
// Assumption, stated on the page: a survivor's earlier picks are independent
// of whether they survive later rounds. The emails give counts per round, not
// each entrant's history, so this is the best the data allows.
// ============================================================================

export type TeamRef = { id: number; name: string };

const ALIASES: Record<string, string[]> = {
  'arsenal': ['ars'],
  'aston villa': ['villa', 'avl'],
  'bournemouth': ['bou', 'afc bournemouth'],
  'brentford': ['bre'],
  'brighton': ['bha', 'bri', 'brighton and hove albion', 'brighton hove albion'],
  'burnley': ['bur'],
  'chelsea': ['che'],
  'coventry': ['cov', 'coventry city'],
  'crystal palace': ['palace', 'cry'],
  'everton': ['eve'],
  'fulham': ['ful'],
  'hull': ['hul', 'hull city'],
  'ipswich': ['ips', 'ipswich town'],
  'leeds': ['lee', 'leeds united'],
  'leicester': ['lei', 'leicester city'],
  'liverpool': ['liv'],
  'man city': ['manchester city', 'mci'],
  'man united': ['manchester united', 'man utd', 'mun', 'man u'],
  'newcastle': ['new', 'newcastle united'],
  'nottm forest': ['nottingham forest', 'nfo', 'forest', 'notts forest'],
  'sunderland': ['sun'],
  'tottenham': ['spurs', 'tot', 'tottenham hotspur'],
  'west ham': ['whu', 'west ham united'],
  'wolves': ['wol', 'wolverhampton', 'wolverhampton wanderers'],
  'west brom': ['wba', 'west bromwich albion'],
  'sheffield united': ['sheff utd', 'sheffield utd', 'shu'],
  'sheffield wednesday': ['sheff wed', 'shw'],
  'middlesbrough': ['boro', 'mid'],
  'qpr': ['queens park rangers'],
  'birmingham': ['birmingham city'],
  'blackburn': ['blackburn rovers'],
  'bristol city': ['bristol c'],
  'norwich': ['norwich city'],
  'stoke': ['stoke city'],
  'swansea': ['swansea city'],
  'cardiff': ['cardiff city'],
  'derby': ['derby county'],
  'preston': ['preston north end', 'pne'],
  'portsmouth': ['pompey'],
  'charlton': ['charlton athletic'],
  'oxford': ['oxford united'],
  'plymouth': ['plymouth argyle'],
  'luton': ['luton town'],
  'lincoln': ['lincoln city'],
};

/** Lower case, letters and spaces only; "utd" → "united"; "'" and "." dropped. */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\bfc\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every name a team might go by in an email, normalised → team id. */
export function nameIndex(teams: TeamRef[]): Map<string, number> {
  const idx = new Map<string, number>();
  const add = (k: string, id: number) => { const n = normName(k); if (n && !idx.has(n)) idx.set(n, id); };
  for (const t of teams) add(t.name, t.id);
  // canonical keys and their aliases, attached to whichever team they name
  for (const [key, alts] of Object.entries(ALIASES)) {
    const id = idx.get(normName(key)) ?? alts.map((a) => idx.get(normName(a))).find((v) => v != null);
    if (id == null) continue;
    add(key, id);
    for (const a of alts) add(a, id);
  }
  // "Nott'm Forest" and the like
  for (const t of teams) add(t.name.replace(/'/g, ''), t.id);
  return idx;
}

export type Parsed = { counts: Map<number, number>; unknown: string[]; lines: number };

/**
 * "Arsenal 1802" per line (also "Arsenal - 1,802", "Arsenal: 1802"). Lines
 * without a trailing number, and headings such as "Game Week 1", are skipped.
 * Names that match no team are returned in `unknown`.
 */
export function parsePickCounts(text: string, teams: TeamRef[]): Parsed {
  const idx = nameIndex(teams);
  const counts = new Map<number, number>();
  const unknown: string[] = [];
  let lines = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /game\s*-?\s*week|^gw\s*\d/i.test(line)) continue;
    const m = line.match(/^(.*?)[\s:–—-]*([\d][\d,]*)\s*$/);
    if (!m || !m[1].trim()) continue;
    const n = Number(m[2].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    const id = idx.get(normName(m[1]));
    lines++;
    if (id == null) { unknown.push(m[1].trim()); continue; }
    counts.set(id, (counts.get(id) ?? 0) + n);
  }
  return { counts, unknown, lines };
}

export function encodeCounts(counts: Map<number, number>): string {
  return [...counts.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id}:${n}`).join(',');
}

export function decodeCounts(s: string | null): Map<number, number> {
  const out = new Map<number, number>();
  for (const part of (s ?? '').split(',')) {
    const [a, b] = part.split(':').map(Number);
    if (Number.isFinite(a) && Number.isFinite(b) && b > 0) out.set(a, (out.get(a) ?? 0) + b);
  }
  return out;
}

/** One round of the field: counts and each team's match, indexed like `teams`. */
export type FieldRound = {
  gw: number;
  /** Entries on each team. */
  counts: number[];
  /** Pre-match win chance, or null when the team had no match (its pickers are left out of the fit). */
  p: (number | null)[];
  /** 1 won, 0 drew or lost, null not played yet. */
  won: (0 | 1 | null)[];
};

export type RoundSummary = {
  gw: number;
  entries: number;
  /** Survivors: known, or expected where results are still to come. */
  survived: number;
  pending: boolean;
  /** Entries on teams whose match hasn't been played yet. */
  stillToPlay: number;
  top: { team: number; n: number }[];
};

export type FieldState = {
  /** Entrants at the start of the first pasted round. */
  entrants0: number;
  /** Field left after the last pasted round (expected where results are pending). */
  left: number;
  pending: boolean;
  /** Share of the surviving field that has used each team. */
  usedShare: number[];
  rounds: RoundSummary[];
};

/** Chance an entry on team j survives this round: the result if known, else the win chance. */
function survive(r: FieldRound, j: number): number {
  const w = r.won[j];
  if (w != null) return w;
  return r.p[j] ?? 0;
}

/**
 * Walk the pasted rounds in order. A round's survivors are its pickers whose
 * team won (or, before the result, are expected to). The share of survivors
 * who have used team j = earlier share (carried forward unchanged, the
 * independence assumption) + this round's survivors on j ÷ all survivors.
 */
export function fieldState(rounds: FieldRound[], T: number): FieldState {
  const sorted = [...rounds].sort((a, b) => a.gw - b.gw);
  let used = new Array(T).fill(0);
  let left = 0;
  let pending = false;
  const out: RoundSummary[] = [];
  sorted.forEach((r) => {
    const entries = r.counts.reduce((a, b) => a + b, 0);
    let S = 0, stillToPlay = 0;
    const surv = r.counts.map((n, j) => {
      if (r.won[j] == null && n > 0) stillToPlay += n;
      const v = n * survive(r, j);
      S += v;
      return v;
    });
    if (stillToPlay > 0) pending = true;
    if (S > 0) used = used.map((u, j) => Math.min(1, u + surv[j] / S));
    left = S;
    const top = r.counts.map((n, j) => ({ team: j, n })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
    out.push({ gw: r.gw, entries, survived: S, pending: stillToPlay > 0, stillToPlay, top });
  });
  return { entrants0: out[0]?.entries ?? 0, left, pending, usedShare: used, rounds: out };
}

/** Pick shares the model gives: unused × exp(β × p), over teams with a match. */
export function modelShares(p: (number | null)[], used: number[], beta: number): number[] {
  const w = p.map((v, j) => (v != null && v > 0 ? Math.max(0, 1 - (used[j] ?? 0)) * Math.exp(beta * v) : 0));
  const s = w.reduce((a, b) => a + b, 0);
  return s > 0 ? w.map((v) => v / s) : w;
}

export type BetaFit = { beta: number; picks: number; rounds: number; logLik: number };

/**
 * β by maximum likelihood over every pasted round (multinomial picks), each
 * round's availability from the rounds before it. Golden-section search on
 * [0, 30]; the log-likelihood is concave in β for fixed availability.
 */
export function fitBeta(rounds: FieldRound[], T: number): BetaFit | null {
  const sorted = [...rounds].sort((a, b) => a.gw - b.gw);
  const usedBefore: number[][] = [];
  for (let i = 0; i < sorted.length; i++) usedBefore.push(fieldState(sorted.slice(0, i), T).usedShare);
  let picks = 0;
  for (const r of sorted) r.counts.forEach((n, j) => { if (r.p[j] != null) picks += n; });
  if (picks === 0) return null;
  const ll = (beta: number) => {
    let s = 0;
    sorted.forEach((r, i) => {
      const q = modelShares(r.p, usedBefore[i], beta);
      r.counts.forEach((n, j) => { if (n > 0 && r.p[j] != null) s += n * Math.log(Math.max(q[j], 1e-12)); });
    });
    return s;
  };
  let a = 0, b = 30;
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a);
  let fc = ll(c), fd = ll(d);
  for (let it = 0; it < 80; it++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = ll(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = ll(d); }
  }
  const beta = (a + b) / 2;
  return { beta, picks, rounds: sorted.length, logLik: ll(beta) };
}

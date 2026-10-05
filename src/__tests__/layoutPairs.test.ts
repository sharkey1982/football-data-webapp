// Enforces src/lib/layoutPairs.ts: page layouts kept consistent across sports.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { LAYOUT_PAIRS, SPORT_LAYOUT_PAIRS } from '../lib/layoutPairs';
import { THEMES } from '../lib/journey';

const root = join(__dirname, '..', '..');
const source = (file: string) => readFileSync(join(root, file), 'utf8');
/** True when the file imports the component by name (default or named). */
const imports = (src: string, name: string) => new RegExp(`import\\s+(?:${name}\\b|[^;]*\\{[^}]*\\b${name}\\b[^}]*\\})[^;]*from`).test(src);

describe('layout pairs (consistent page layouts across sports)', () => {
  it('lists every NFL menu page, so a new page needs a decision', () => {
    const listed = new Set(LAYOUT_PAIRS.map((p) => p.nflPath));
    const menu = THEMES.nfl.stages.flatMap((s) => s.links.map((l) => l.to));
    for (const to of [THEMES.nfl.hubPath, ...menu]) expect(listed, `${to} is not in src/lib/layoutPairs.ts`).toContain(to);
  });

  it.each(LAYOUT_PAIRS.map((p) => [p.label, p] as const))('%s: both pages exist and use the shared components', (_label, p) => {
    expect(existsSync(join(root, p.nflFile)), p.nflFile).toBe(true);
    if (p.status === 'nfl-only') {
      expect(p.footballFile, `${p.label} is nfl-only but names a football file`).toBeNull();
      expect(p.shared).toEqual([]);
      return;
    }
    expect(p.footballFile, `${p.label} needs a football file`).not.toBeNull();
    expect(existsSync(join(root, p.footballFile!)), p.footballFile!).toBe(true);
    if (p.status === 'separate') {
      expect(p.shared).toEqual([]);
      return;
    }
    expect(p.shared.length, `${p.label} is '${p.status}' but lists no shared component`).toBeGreaterThan(0);
    for (const name of p.shared) {
      expect(imports(source(p.footballFile!), name), `${p.footballFile} no longer uses ${name}`).toBe(true);
      expect(imports(source(p.nflFile), name), `${p.nflFile} no longer uses ${name}`).toBe(true);
    }
  });
});

describe('sport layout pairs (tennis and later sports)', () => {
  it.each(['tennis', 'international'] as const)('lists every %s menu page and the hub', (sport) => {
    const listed = new Set(SPORT_LAYOUT_PAIRS.filter((p) => p.sport === sport).map((p) => p.path));
    const menu = THEMES[sport].stages.flatMap((s) => s.links.map((l) => l.to));
    for (const to of [THEMES[sport].hubPath, ...menu]) expect(listed, `${to} is not in SPORT_LAYOUT_PAIRS`).toContain(to);
  });

  it.each(SPORT_LAYOUT_PAIRS.map((p) => [`${p.sport}: ${p.label}`, p] as const))('%s: both pages exist and use the shared components', (_label, p) => {
    expect(existsSync(join(root, p.file)), p.file).toBe(true);
    if (p.status === 'sport-only') {
      expect(p.footballFile).toBeNull();
      expect(p.shared).toEqual([]);
      return;
    }
    expect(p.footballFile, `${p.label} needs a football file`).not.toBeNull();
    expect(existsSync(join(root, p.footballFile!)), p.footballFile!).toBe(true);
    if (p.status === 'separate') {
      expect(p.shared).toEqual([]);
      return;
    }
    expect(p.shared.length).toBeGreaterThan(0);
    for (const name of p.shared) {
      expect(imports(source(p.footballFile!), name), `${p.footballFile} no longer uses ${name}`).toBe(true);
      expect(imports(source(p.file), name), `${p.file} no longer uses ${name}`).toBe(true);
    }
  });
});

// Menu bars kept consistent, ordering included (Chris, 5 Oct 2026). Football
// and Fantasy Premier League set the pattern; every other sport's menu must
// use the same sections in the same order, and wherever a page shares its name
// with a Football or FPL page in the same section, the shared pages appear in
// that menu's order. Sport-only pages may sit anywhere between them.
describe('menu order matches Football and FPL', () => {
  const REFERENCE = ['football', 'fpl'] as const;
  const others = (Object.keys(THEMES) as (keyof typeof THEMES)[]).filter((k) => !(REFERENCE as readonly string[]).includes(k));
  const sectionOrder = THEMES.football.stages.map((s) => s.key);

  it('Football and FPL use the same sections in the same order', () => {
    expect(THEMES.fpl.stages.map((s) => s.key)).toEqual(sectionOrder);
  });

  it.each(others)('%s: sections in Football order', (k) => {
    const keys = THEMES[k].stages.map((s) => s.key);
    expect(keys, `${k} sections`).toEqual(sectionOrder.slice(0, keys.length));
  });

  for (const k of others) {
    for (const ref of REFERENCE) {
      it(`${k}: shared pages in ${ref} order, section by section`, () => {
        for (const stage of THEMES[k].stages) {
          const refStage = THEMES[ref].stages.find((s) => s.key === stage.key);
          if (!refStage) continue;
          const refLabels = refStage.links.map((l) => l.label);
          const shared = stage.links.map((l) => l.label).filter((l) => refLabels.includes(l));
          const expected = refLabels.filter((l) => shared.includes(l));
          expect(shared, `${k} ${stage.key}: pages shared with ${ref} must follow its order`).toEqual(expected);
        }
      });
    }
  }
});

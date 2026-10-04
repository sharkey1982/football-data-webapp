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
  it('lists every tennis menu page and the hub', () => {
    const listed = new Set(SPORT_LAYOUT_PAIRS.filter((p) => p.sport === 'tennis').map((p) => p.path));
    const menu = THEMES.tennis.stages.flatMap((s) => s.links.map((l) => l.to));
    for (const to of [THEMES.tennis.hubPath, ...menu]) expect(listed, `${to} is not in SPORT_LAYOUT_PAIRS`).toContain(to);
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

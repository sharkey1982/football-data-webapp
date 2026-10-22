// Audit 22 Oct 2026, S-09: the smoke test reads its page list from
// scripts/smoke/menu-pages.json (it runs without the app's TypeScript).
// This keeps that file equal to the menu in journey.ts. To refresh it:
//   npx tsx -e "import { menuOrder, THEMES } from './src/lib/journey'; require('fs').writeFileSync('scripts/smoke/menu-pages.json', JSON.stringify({ hubs: Object.values(THEMES).map((t) => t.hubPath), menu: menuOrder() }, null, 2) + '\n')"
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES, menuOrder } from '../lib/journey';

describe('smoke test page list', () => {
  it('menu-pages.json lists every hub and header-menu page', () => {
    const file = JSON.parse(readFileSync(`${process.cwd()}/scripts/smoke/menu-pages.json`, 'utf8'));
    expect(file).toEqual({ hubs: Object.values(THEMES).map((t) => t.hubPath), menu: menuOrder() });
  });

  it('the smoke script tests /fpl/start, /nfl/table and labels /fpl as Match Projections', () => {
    const src = readFileSync(`${process.cwd()}/scripts/smoke/weekly_smoke.mjs`, 'utf8');
    expect(src).toContain("['fpl-match-projections', '/fpl']");
    expect(src).toContain("['fpl-start', '/fpl/start']");
    expect(src).toContain("['nfl-table', '/nfl/table']");
    expect(src).not.toContain("'/nfl/standings'");
    expect(src).toContain("readFileSync(new URL('./menu-pages.json', import.meta.url)");
  });
});

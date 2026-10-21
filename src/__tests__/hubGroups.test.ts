import { describe, it, expect } from 'vitest';
import { THEMES, HUB_GROUPS, hubGroups, type ThemeKey } from '../lib/journey';

describe('hub page groups', () => {
  for (const key of ['football', 'fpl'] as ThemeKey[]) {
    it(`${key}: every menu page is in exactly one group, and every group path is a menu page`, () => {
      const menu = THEMES[key].stages.flatMap((s) => s.links.map((l) => l.to));
      const grouped = (HUB_GROUPS[key] ?? []).flatMap((g) => g.paths);
      expect([...grouped].sort()).toEqual([...new Set(menu)].sort());
      expect(new Set(grouped).size).toBe(grouped.length);
      expect(hubGroups(key).flatMap((g) => g.links).length).toBe(grouped.length);
    });
  }
});

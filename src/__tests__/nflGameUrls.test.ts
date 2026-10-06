import { describe, expect, it } from 'vitest';
import { nflGameIdFromParam, nflGamePath, nflMatchProjectionPath } from '../lib/nflApi';

describe('NFL game URLs are lower case (Netlify 301s mixed-case paths)', () => {
  it('paths lower-case the id; the page turns it back', () => {
    expect(nflGamePath('2026_11_MIA_BUF')).toBe('/nfl/games/2026_11_mia_buf');
    expect(nflMatchProjectionPath('2026_11_MIA_BUF')).toBe('/nfl/match-projections/2026_11_mia_buf');
    expect(nflGameIdFromParam('2026_11_mia_buf')).toBe('2026_11_MIA_BUF');
    expect(nflGameIdFromParam('2026_11_MIA_BUF')).toBe('2026_11_MIA_BUF');
    expect(nflGameIdFromParam(undefined)).toBe('');
  });
});

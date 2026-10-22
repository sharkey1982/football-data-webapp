import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error -- plain .mjs CI script, no type declarations
import { objects, diffTypes } from '../../scripts/check-db-types.mjs';

const file = (tables: string, fns = '') => `export type Json = string

export type Database = {
  // generator comment
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
${tables}
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
${fns}
    }
  }
}
`;

const teams = `      teams: {
        Row: {
          team_id: number
          name: string
        }
      }`;
const teamsWithUrl = `      teams: {
        Row: {
          team_id: number
          name: string
          official_website_url: string | null
        }
      }`;
const fn = `      current_season_id: { Args: never; Returns: number }`;

describe('check-db-types (weekly generated-types drift check, CODE-08)', () => {
  it('splits the file into one block per table, view and function', () => {
    const o = objects(file(teams, fn));
    expect([...o.keys()]).toEqual(['Tables teams', 'Functions current_season_id']);
  });

  it('agrees when only comments, the header block or whitespace differ', () => {
    const a = file(teams, fn);
    const b = a.replace('// generator comment', '// another').replace('"14.5"', '"13.0"').replace(/\n/g, '\n\n');
    expect(diffTypes(a, b).same).toBe(true);
  });

  it('reports new, gone and changed objects', () => {
    const d = diffTypes(file(teams), file(teamsWithUrl, fn));
    expect(d).toMatchObject({ added: ['Functions current_season_id'], removed: [], changed: ['Tables teams'], same: false });
    expect(diffTypes(file(teams, fn), file(teams)).removed).toEqual(['Functions current_season_id']);
  });

  it('reads the committed types file as hundreds of objects', () => {
    const o = objects(readFileSync('src/types/database.generated.ts', 'utf8'));
    expect(o.size).toBeGreaterThan(300);
    expect(o.has('Tables fixtures')).toBe(true);
    expect(o.has('Functions record_match_predictions') || o.has('Functions current_season_id')).toBe(true);
  });
});

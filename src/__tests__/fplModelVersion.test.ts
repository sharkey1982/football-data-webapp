// Regression test (16 Oct 2026): the FPL projection model version lives in one
// place. A monitoring view still checked the retired 'prototype_v3' weeks after
// production moved to leaguewide_v6 and reported 320 fixtures "missing"; four
// frontend files repeated the literal. Promoting a model must be one change
// here (plus public.production_models), not a hunt.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CURRENT_MODEL_VERSION } from '../lib/fplModel';
import { CURRENT_MODEL_VERSION as viaFplApi } from '../lib/fplApi';

// Dated analyses that deliberately pin the model they were written with.
const PINNED = new Set(['fplArticleCaptainPairs.ts', 'fplArticleDecisions.ts', 'fplModel.ts']);
const VERSION_LITERAL = /['"`](leaguewide|prototype|trial)_v\d+['"`]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.includes('.generated.') ? [path] : [];
  });
}

describe('FPL production model version', () => {
  it('has one value, re-exported unchanged by fplApi', () => {
    expect(CURRENT_MODEL_VERSION).toMatch(/^[a-z]+_v\d+$/);
    expect(viaFplApi).toBe(CURRENT_MODEL_VERSION);
  });

  it('is not repeated as a literal anywhere else in src', () => {
    const offenders = sourceFiles(join(__dirname, '..'))
      .filter((f) => !PINNED.has(f.split(/[\\/]/).pop() ?? ''))
      .filter((f) => readFileSync(f, 'utf8').split('\n').some((line) => VERSION_LITERAL.test(line) && !line.trim().startsWith('*') && !line.trim().startsWith('//')));
    expect(offenders).toEqual([]);
  });

  it('matches the version the database names in production_models (seed migration)', () => {
    const migrations = join(__dirname, '..', '..', 'supabase', 'migrations');
    const seeds = readdirSync(migrations)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(join(migrations, f), 'utf8'))
      .flatMap((sql) => [
        // insert ... values ('fpl_player_projection', '<version>', ...)
        ...[...sql.matchAll(/production_models[^;]*?'fpl_player_projection',\s*'([a-z_0-9]+)'/g)].map((m) => m[1]),
        // update production_models set model_version = '<version>' where component = 'fpl_player_projection'
        ...[...sql.matchAll(/production_models\s+set\s+model_version\s*=\s*'([a-z_0-9]+)'\s+where\s+component\s*=\s*'fpl_player_projection'/g)].map((m) => m[1]),
      ])
      .filter((v) => v !== 'zz_regression_test');
    // The last migration to set it wins; it must equal the frontend's value.
    expect(seeds.length).toBeGreaterThan(0);
    expect(seeds[seeds.length - 1]).toBe(CURRENT_MODEL_VERSION);
  });
});

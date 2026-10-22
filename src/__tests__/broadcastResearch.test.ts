// Regression test (22 Oct 2026): UK TV data now arrives through
// public.ingest_broadcasts(), driven by the procedure in
// docs/broadcast-research.md. The scheduled task follows the document
// literally, so every field it documents must be one the function reads,
// and no source code may depend on Airtable again.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const doc = readFileSync(join(root, 'docs', 'broadcast-research.md'), 'utf8');
const migrationsDir = join(root, 'supabase', 'migrations');

function latestIngestBody(): string {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const withIngest = files.filter((f) =>
    /create or replace function public\.ingest_broadcasts\(/i.test(readFileSync(join(migrationsDir, f), 'utf8')),
  );
  expect(withIngest.length).toBeGreaterThan(0);
  const sql = readFileSync(join(migrationsDir, withIngest[withIngest.length - 1]), 'utf8');
  const start = sql.search(/create or replace function public\.ingest_broadcasts\(/i);
  return sql.slice(start, sql.indexOf('$function$;', start));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('broadcast research route', () => {
  it('documents only fields that ingest_broadcasts reads', () => {
    const body = latestIngestBody();
    const table = doc.slice(doc.indexOf('| Field | Required |'), doc.indexOf('**Matching.**'));
    const fields = [...table.matchAll(/^\| ((?:`[a-z_]+`(?:, )?)+) \|/gm)].flatMap((m) =>
      [...m[1].matchAll(/`([a-z_]+)`/g)].map((x) => x[1]),
    );
    expect(fields.length).toBeGreaterThan(20);
    for (const field of fields) {
      expect(body, `ingest_broadcasts should read '${field}'`).toContain(`'${field}'`);
    }
  });

  it('keeps both statuses and the source_url rule in step with the function', () => {
    const body = latestIngestBody();
    for (const s of ['confirmed_broadcast', 'confirmed_not_televised']) {
      expect(doc).toContain(s);
      expect(body).toContain(`'${s}'`);
    }
    expect(body).toMatch(/source_url \(http\/https\) is required for confirmed_broadcast/);
  });

  it('has no Airtable dependency left in the app source', () => {
    // database.generated.ts mirrors the live schema (airtable_record_id columns
    // remain on the broadcast tables); it is generated, not app code.
    const hits = sourceFiles(join(root, 'src'))
      .filter((f) => !f.endsWith('database.generated.ts'))
      .filter((f) => /airtable/i.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});

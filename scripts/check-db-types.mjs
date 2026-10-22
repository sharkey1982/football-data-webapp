#!/usr/bin/env node
// Weekly drift check for src/types/database.generated.ts (audit 2026-10-22,
// CODE-08). Run by .github/workflows/schema-snapshot.yml after it generates
// fresh types from the live database:
//
//   node scripts/check-db-types.mjs src/types/database.generated.ts /tmp/fresh.ts
//
// Exits 1 (with a list of the objects that differ) when the committed types
// no longer match the live public schema. To fix: regenerate the file (the
// Supabase MCP tool generate_typescript_types, or
// `supabase gen types typescript --db-url ... --schema public`), run tsc,
// remove any `as never` casts the new types make unnecessary, and open a PR.
// The comparison ignores the generator's header block (__InternalSupabase)
// and whitespace, so two generators that differ only there still agree.
import { readFileSync } from 'node:fs';

export function normalise(src) {
  return src
    .replace(/\r\n/g, '\n')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/__InternalSupabase: \{[^}]*\}\s*/m, '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
    .join('\n');
}

/** Object blocks (tables, views, functions) keyed "Kind name" -> their normalised text. */
export function objects(src) {
  const out = new Map();
  const lines = normalise(src).split('\n');
  let kind = null;
  let name = null;
  let buf = [];
  const flush = () => {
    if (kind && name) out.set(`${kind} ${name}`, buf.join('\n'));
    name = null;
    buf = [];
  };
  for (const line of lines) {
    const k = line.match(/^ {4}(Tables|Views|Functions|Enums|CompositeTypes): \{/);
    if (k) {
      flush();
      kind = k[1];
      continue;
    }
    const o = line.match(/^ {6}([A-Za-z0-9_]+):/);
    if (kind && o) {
      flush();
      name = o[1];
    }
    if (/^ {0,4}\S/.test(line) && !k) {
      flush();
      if (/^ {0,2}\S/.test(line)) kind = null;
      continue;
    }
    if (name) buf.push(line);
  }
  flush();
  return out;
}

export function diffTypes(committed, fresh) {
  const a = objects(committed);
  const b = objects(fresh);
  const added = [...b.keys()].filter((k) => !a.has(k));
  const removed = [...a.keys()].filter((k) => !b.has(k));
  const changed = [...a.keys()].filter((k) => b.has(k) && a.get(k) !== b.get(k));
  return { added, removed, changed, same: added.length + removed.length + changed.length === 0 };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const [committedPath, freshPath] = process.argv.slice(2);
  if (!committedPath || !freshPath) {
    console.error('usage: node scripts/check-db-types.mjs <committed.ts> <fresh.ts>');
    process.exit(2);
  }
  const fresh = readFileSync(freshPath, 'utf8');
  if (!/export type Database = \{/.test(fresh) || objects(fresh).size < 50) {
    console.error('::error::Fresh types look incomplete (generation failed?) -- not comparing.');
    process.exit(1);
  }
  const d = diffTypes(readFileSync(committedPath, 'utf8'), fresh);
  if (d.same) {
    console.log('Generated DB types match the live schema.');
    process.exit(0);
  }
  const show = (label, xs) => xs.length && console.log(`${label} (${xs.length}): ${xs.slice(0, 40).join(', ')}${xs.length > 40 ? ', ...' : ''}`);
  console.log('::error::src/types/database.generated.ts is out of date with the live schema.');
  show('New in the database', d.added);
  show('Gone from the database', d.removed);
  show('Changed', d.changed);
  console.log('Regenerate the file, run tsc, and open a PR (see the header of scripts/check-db-types.mjs).');
  process.exit(1);
}

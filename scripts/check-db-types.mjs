#!/usr/bin/env node
// Weekly drift check for src/types/database.generated.ts (audit 2026-10-22,
// CODE-08). Run by .github/workflows/schema-snapshot.yml after it generates
// fresh types from the live database:
//
//   node scripts/check-db-types.mjs src/types/database.generated.ts /tmp/fresh.ts
//
// Exits 1 (with a list of the objects that differ) when the committed types
// no longer match the live public schema. To fix: regenerate the file from
// the CLI's output (`supabase@2.121.0 gen types typescript --db-url ...
// --schema public`, or the FRESH-TYPES block the failed job prints:
// base64 -d | gunzip), format it with `npx oxfmt@0.74.0`, run tsc, remove
// any `as never` casts the new types make unnecessary, and open a PR.
// NOT the Supabase MCP tool generate_typescript_types: since late Oct 2026
// the CLI writes `ComputedFields: never` and `NonNullable<Json>`, which the
// MCP generator does not, so an MCP-generated file differs in every object.
// The comparison ignores comments, the header block (__InternalSupabase) and
// whitespace; the workflow formats both files with oxfmt first.
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

/** The first differing line of two object blocks, with a few lines of context from each. */
export function firstDifference(a = '', b = '') {
  const x = a.split('\n');
  const y = b.split('\n');
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  const from = Math.max(0, i - 2);
  return [
    `committed (line ${i + 1}):`, ...x.slice(from, i + 4).map((l) => `  ${l}`),
    `fresh (line ${i + 1}):`, ...y.slice(from, i + 4).map((l) => `  ${l}`),
  ].join('\n');
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
  const committed = readFileSync(committedPath, 'utf8');
  const d = diffTypes(committed, fresh);
  if (d.same) {
    console.log('Generated DB types match the live schema.');
    process.exit(0);
  }
  const show = (label, xs) => xs.length && console.log(`${label} (${xs.length}): ${xs.slice(0, 40).join(', ')}${xs.length > 40 ? ', ...' : ''}`);
  console.log('::error::src/types/database.generated.ts is out of date with the live schema.');
  show('New in the database', d.added);
  show('Gone from the database', d.removed);
  show('Changed', d.changed);
  // 2 Nov 2026: show HOW the first changed objects differ, so a generator
  // change can be told apart from a schema change without the fresh file.
  for (const k of d.changed.slice(0, 3)) console.log(`\n--- ${k}\n${firstDifference(objects(committed).get(k), objects(fresh).get(k))}`);
  console.log('Regenerate the file, run tsc, and open a PR (see the header of scripts/check-db-types.mjs).');
  process.exit(1);
}

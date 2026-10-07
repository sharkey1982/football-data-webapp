#!/usr/bin/env node
// ============================================================================
// scripts/check-indexability.mjs
//
// Last build step: checks EVERY sitemap URL against the generated files with
// the rules in scripts/lib/indexability.mjs (https apex, no slash/query/case
// variants, not robots-blocked, a generated file whose canonical is exactly
// the URL, no noindex, unique title), and that private paths stay out of the
// sitemap and blocked. Writes the result to the build log and appends it to
// /build-report.txt.
//
// Report-only, like verify-dist: never exits non-zero, because a missing or
// imperfect page must not cost a deploy. The rules themselves are pinned by
// src/__tests__/indexability.test.ts, and the live site by site-health.yml.
// ============================================================================
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVATE_PATHS, duplicateTitles, googlebotDisallows, headTags, isBlocked, pageProblems, urlShapeProblems } from './lib/indexability.mjs';

const DIST = join(process.cwd(), 'dist');
const lines = [];
const log = (s) => {
  console.log(`Indexability: ${s}`);
  lines.push(s);
};

function fileFor(pathname) {
  if (pathname === '/') return join(DIST, 'index.html');
  const parts = pathname.split('/').filter(Boolean);
  const flat = join(DIST, ...parts) + '.html';
  if (existsSync(flat)) return flat;
  const folder = join(DIST, ...parts, 'index.html');
  return existsSync(folder) ? folder : null;
}

try {
  const robots = existsSync(join(DIST, 'robots.txt')) ? readFileSync(join(DIST, 'robots.txt'), 'utf8') : '';
  const disallows = googlebotDisallows(robots);
  const dir = join(DIST, 'sitemaps');
  const locs = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith('.xml')).flatMap((f) => [...readFileSync(join(dir, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&')))
    : [];
  const problems = new Map();
  const add = (kind, loc) => {
    if (!problems.has(kind)) problems.set(kind, []);
    problems.get(kind).push(loc);
  };
  const pages = [];
  for (const loc of locs) {
    for (const p of urlShapeProblems(loc)) add(`URL shape: ${p}`, loc);
    const path = new URL(loc).pathname;
    if (isBlocked(path, disallows)) add('blocked by robots.txt', loc);
    const file = fileFor(path);
    const html = file ? readFileSync(file, 'utf8') : null;
    for (const p of pageProblems(loc, html)) add(p.startsWith('canonical is') ? 'canonical points elsewhere' : p, loc);
    if (html) pages.push({ loc, title: headTags(html).title });
  }
  const dupes = duplicateTitles(pages);
  for (const [, ls] of dupes) for (const l of ls) add('title shared with another sitemap page', l);
  for (const p of PRIVATE_PATHS) {
    if (!isBlocked(p, disallows)) add('private path not blocked by robots.txt', p);
    if (locs.some((l) => new URL(l).pathname.startsWith(p))) add('private path in the sitemap', p);
  }

  log(`${locs.length} sitemap URL(s) checked, ${pages.length} with a generated file.`);
  if (problems.size === 0) log('all sitemap URLs pass.');
  for (const [kind, ls] of problems) log(`PROBLEM ${kind}: ${ls.length}, e.g. ${ls.slice(0, 3).join(', ')}`);
  const report = join(DIST, 'build-report.txt');
  appendFileSync(report, `\nIndexability (${new Date().toISOString()})\n${lines.map((l) => `  ${l}`).join('\n')}\n`);
} catch (err) {
  console.error('Indexability: check failed --', err?.message ?? err);
}
process.exit(0);

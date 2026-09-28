#!/usr/bin/env node
// ============================================================================
// scripts/write-flat-html.mjs
//
// Writes dist/<path>.html beside every generated dist/<path>/index.html.
//
// WHY. Every canonical tag and every sitemap URL is written WITHOUT a trailing
// slash (https://fixtureshark.com/fixtures). But generation only wrote
// folder-style files (fixtures/index.html), and with Netlify's Pretty URLs
// (on by default) a folder-only page answers /fixtures with a 301 to
// /fixtures/. So every URL we told Google about redirected, and the page it
// redirected to declared the ORIGINAL URL canonical -- a canonical/redirect
// loop across the whole sitemap (found 2026-09-28, production crawl audit).
//
// With BOTH files present, Netlify serves /fixtures as 200 from fixtures.html
// and 301s /fixtures/ to /fixtures -- exactly the canonical form. Netlify
// uploads by content hash, so the duplicates cost no extra upload.
//
// Same discipline as the other post-build steps: no network, no child
// processes, never a non-zero exit. A missing flat file only means that one
// URL keeps its old 301 -- it must never cost a deploy.
// ============================================================================

import { readdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = join(process.cwd(), 'dist');
// Never touched: hashed assets, and the separately deployed game (proxied).
const SKIP_TOP = new Set(['assets', 'play']);

let written = 0;
let kept = 0;
let failed = 0;

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const child = join(dir, e.name);
    if (dir === DIST && SKIP_TOP.has(e.name)) continue;
    const index = join(child, 'index.html');
    if (existsSync(index)) {
      const flat = `${child}.html`;
      if (existsSync(flat)) {
        kept++;
      } else {
        try {
          copyFileSync(index, flat);
          written++;
        } catch (err) {
          failed++;
          if (failed <= 5) console.error(`Flat HTML: failed ${relative(DIST, flat)}: ${err?.message ?? err}`);
        }
      }
    }
    walk(child);
  }
}

try {
  if (!existsSync(DIST)) {
    console.warn('Flat HTML: no dist/ -- skipping.');
  } else {
    walk(DIST);
    console.log(`Flat HTML: wrote ${written} file(s), ${kept} already present, ${failed} failed.`);
  }
} catch (err) {
  console.error('Flat HTML: failed --', err?.message ?? err);
}
process.exit(0);

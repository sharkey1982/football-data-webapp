#!/usr/bin/env node
// ============================================================================
// scripts/prerender.mjs
//
// Runs after `vite build`, before Netlify serves dist/. Serves the just-built
// app locally (vite preview), visits each canonical route in a real headless
// browser (so the app's existing fetch-on-mount data loading -- useEffect
// calling Supabase -- runs exactly as it does for a real visitor, no
// rewrite needed), waits for it to settle, and writes the resulting HTML to
// dist/<route>/index.html. This is what makes the AI/Search Discoverability
// Audit's core finding stop being true: a crawler currently gets an empty
// <div id="root"> and has to execute JS to see anything.
//
// Deliberately NOT a true SSR (ReactDOMServer.renderToString) setup: every
// page here fetches its data in useEffect, which never fires during
// renderToString (no real DOM commit happens), so that approach would just
// render empty loading states -- fixing it properly would mean refactoring
// every canonical page's data-fetching pattern (fetch-before-render instead
// of fetch-on-mount), which is a far more invasive change than this file.
// A real headless browser sidesteps that entirely by using the app exactly
// as it already works.
//
// FAILS SAFE: wrapped so that any failure here -- Chrome unavailable,
// a page timing out, anything -- prints a warning and exits 0, never 1.
// netlify.toml chains this after the real build with &&, so a hard failure
// here would take the whole site down; a missed prerender pass does not
// (the site just serves exactly what it does today, unprerendered, until
// the next successful build).
//
// Untested end-to-end before this first live deploy -- Puppeteer's Chrome
// download is blocked by this development sandbox's own network allowlist,
// so this could only be verified by actually shipping it and checking the
// real build log, which is what the fail-safe wrapper is specifically for.
// ============================================================================

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;
const DIST_DIR = path.resolve(import.meta.dirname, '..', 'dist');

// Deliberately small and static for this first pass -- the existing,
// parameter-free canonical pages. Per-entity routes (/football/teams/:slug
// and similar) need their own list of slugs fetched first and are left for
// a follow-up once this pipeline itself is confirmed working live.
const ROUTES = [
  '/',
  '/football',
  '/fpl/start',
  '/fixtures',
  '/table',
  '/team-strength',
  '/teams',
  '/fpl/player-points',
  '/fpl/scoring-rules',
];

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch {
        // Not up yet -- keep polling.
      }
      if (Date.now() - start > timeoutMs) return reject(new Error(`Server didn't respond at ${url} within ${timeoutMs}ms`));
      setTimeout(tick, 300);
    };
    tick();
  });
}

async function main() {
  console.log('Prerender: starting `vite preview` to serve the just-built dist/...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: path.resolve(import.meta.dirname, '..'),
  });
  let previewOutput = '';
  preview.stdout.on('data', (d) => (previewOutput += d.toString()));
  preview.stderr.on('data', (d) => (previewOutput += d.toString()));

  try {
    await waitForServer(BASE_URL);
    console.log('Prerender: preview server up, launching headless browser...');

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    let succeeded = 0;
    let failed = 0;
    for (const route of ROUTES) {
      const url = `${BASE_URL}${route}`;
      try {
        const page = await browser.newPage();
        // networkidle0: no in-flight network requests for 500ms -- a
        // reasonable proxy for "this page's Supabase fetches have
        // resolved" without needing every page to expose its own
        // explicit "data ready" signal.
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        const html = await page.content();
        const outDir = route === '/' ? DIST_DIR : path.join(DIST_DIR, route);
        await mkdir(outDir, { recursive: true });
        await writeFile(path.join(outDir, 'index.html'), html, 'utf-8');
        await page.close();
        succeeded++;
        console.log(`Prerender: OK ${route}`);
      } catch (err) {
        failed++;
        console.warn(`Prerender: FAILED ${route} -- ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await browser.close();
    console.log(`Prerender: done -- ${succeeded} succeeded, ${failed} failed, out of ${ROUTES.length} route(s).`);
  } finally {
    preview.kill();
  }
}

main().catch((err) => {
  console.warn('Prerender: skipped entirely due to an unexpected error -- the site will deploy unprerendered, exactly as it does today.');
  console.warn(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(0); // Deliberate: see the file header. A failed prerender pass must never fail the build.
});

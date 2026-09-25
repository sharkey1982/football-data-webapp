#!/usr/bin/env node
// Copies the untouched Vite shell to dist/app-shell.html, which netlify.toml
// serves for any path with no generated file of its own.
//
// Why not fall back to dist/index.html: generate-static overwrites that file
// with the HOMEPAGE's head, including <link rel="canonical" href="/">. Serving
// it for /tv-guide would tell a crawler that page is a duplicate of the home
// page. This copy is taken before any of that runs, so it has no canonical;
// each page's own useDocumentHead() supplies one once the app boots.
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const src = join(process.cwd(), 'dist', 'index.html');
const dest = join(process.cwd(), 'dist', 'app-shell.html');
if (!existsSync(src)) {
  console.error('App shell: dist/index.html missing -- nothing to copy.');
  process.exit(1);
}
copyFileSync(src, dest);
console.log('App shell: wrote dist/app-shell.html');

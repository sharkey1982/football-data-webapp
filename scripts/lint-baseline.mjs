#!/usr/bin/env node
// Lint ratchet: fails only on lint errors that are NEW compared with the
// committed baseline (scripts/eslint-baseline.json, counts per file + rule).
// The repo carries ~400 historic errors (mostly no-explicit-any and
// react-refresh/only-export-components); this stops the number growing
// without a big-bang clean-up.
//
//   node scripts/lint-baseline.mjs            check (CI: .github/workflows/pr-checks.yml)
//   node scripts/lint-baseline.mjs --update   rewrite the baseline after fixing errors
//
// A (file, rule) pair passes when its error count is at or below the
// baseline. Fixing errors never fails; run --update to lock the gain in.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const BASELINE = join(ROOT, 'scripts', 'eslint-baseline.json');

export function countErrors(results, root = ROOT) {
  const counts = {};
  for (const f of results) {
    for (const m of f.messages) {
      if (m.severity !== 2) continue;
      const key = `${relative(root, f.filePath).split('\\').join('/')} :: ${m.ruleId ?? 'parse-error'}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function compare(current, baseline) {
  const regressions = [];
  for (const [key, n] of Object.entries(current)) {
    const allowed = baseline[key] ?? 0;
    if (n > allowed) regressions.push({ key, n, allowed });
  }
  return regressions;
}

function runEslint() {
  let out;
  try {
    out = execFileSync('npx', ['eslint', '.', '--format', 'json'], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' });
  } catch (e) {
    // eslint exits 1 when there are errors; the JSON is still on stdout.
    if (e.stdout) out = e.stdout;
    else throw e;
  }
  return JSON.parse(out);
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const current = countErrors(runEslint());
  const total = Object.values(current).reduce((a, b) => a + b, 0);
  if (process.argv.includes('--update')) {
    writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
    console.log(`Baseline written: ${total} errors in ${Object.keys(current).length} file/rule pairs.`);
    process.exit(0);
  }
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
  const baseTotal = Object.values(baseline).reduce((a, b) => a + b, 0);
  const regressions = compare(current, baseline);
  console.log(`Lint: ${total} errors now, ${baseTotal} in the baseline.`);
  if (regressions.length) {
    console.log('New lint errors (fix them, or explain in the PR why the baseline should grow):');
    for (const r of regressions) console.log(`  ${r.key}: ${r.n} (baseline ${r.allowed})`);
    console.log('Run `npx eslint <file>` to see the messages.');
    process.exit(1);
  }
  if (total < baseTotal) console.log('Fewer errors than the baseline: run `node scripts/lint-baseline.mjs --update` to lock the gain in.');
  console.log('Lint: no new errors.');
}

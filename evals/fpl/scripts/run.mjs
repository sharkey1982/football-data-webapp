// Runs the eval steps with Promptfoo's environment set the same way on any OS:
// no telemetry, no sharing, no update checks, and Promptfoo's local database
// kept inside this folder (.promptfoo/, gitignored).
//
//   node scripts/run.mjs offline           reference + seeded faults + self-test (no API calls, free)
//   node scripts/run.mjs live [--repeat N] the real model (needs ANTHROPIC_API_KEY; costs money)
//   node scripts/run.mjs judge <results>   advisory LLM judge on a saved live run (costs money)
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../providers/_common.mjs';

const env = { ...process.env, PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_UPDATE: '1', PROMPTFOO_DISABLE_SHARING: '1', PROMPTFOO_CONFIG_DIR: join(ROOT, '.promptfoo') };
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const run = (cmd, args, extra = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...env, ...extra }, shell: process.platform === 'win32' });
  return r.status ?? 1;
};
const pf = (args, extra) => run('npx', ['promptfoo', 'eval', '--no-share', '--no-cache', ...args], extra);

const [mode, ...rest] = process.argv.slice(2);
mkdirSync(join(ROOT, 'results', 'scratch'), { recursive: true });

if (mode === 'offline') {
  run('node', ['scripts/check-snapshots.mjs']) === 0 || process.exit(1);
  pf(['-c', 'promptfooconfig.yaml', '-r', 'file://providers/reference.mjs', '-o', 'results/scratch/reference.json']);
  pf(['-c', 'promptfooconfig.yaml', '-r', 'file://providers/faulty.mjs', '-o', 'results/scratch/faulty.json']);
  process.exit(run('node', ['scripts/self-test.mjs', 'results/scratch/reference.json', 'results/scratch/faulty.json']));
} else if (mode === 'live') {
  if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY is not set. Set it in your shell for this session only; never commit it.'); process.exit(2); }
  run('node', ['scripts/check-snapshots.mjs']) === 0 || process.exit(1);
  const out = `results/live-${stamp}.json`;
  pf(['-c', 'promptfooconfig.yaml', '-o', out, ...rest]);
  console.log(`\nSaved ${out}. Report: node scripts/report.mjs ${out}`);
} else if (mode === 'judge') {
  const from = rest[0];
  if (!from) { console.error('usage: node scripts/run.mjs judge results/live-<stamp>.json'); process.exit(2); }
  if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY is not set.'); process.exit(2); }
  const out = from.replace(/\.json$/, '.judge.json');
  pf(['-c', 'promptfooconfig.judge.yaml', '-o', out], { REPLAY_FROM: from });
  console.log(`\nSaved ${out}. Report: node scripts/report.mjs ${from} --judge ${out}`);
} else {
  console.error('usage: node scripts/run.mjs offline | live [--repeat N] | judge <results.json>');
  process.exit(2);
}

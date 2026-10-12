// What one eval run cost, in USD, for the AI credit estimate on /admin/ai-lab
// and /admin/ask. Same arithmetic as report.mjs: Promptfoo's per-answer cost,
// plus the judge's tokens at claude-sonnet-5 list prices when a judge file is given.
// Usage: node scripts/spend.mjs <live.json> [<live.judge.json>]   -> prints e.g. 0.284300
import { readFileSync, existsSync } from 'node:fs';

const [file, judge] = process.argv.slice(2);
if (!file) { console.error('usage: node scripts/spend.mjs <live.json> [<judge.json>]'); process.exit(2); }
const rows = JSON.parse(readFileSync(file, 'utf8')).results?.results ?? [];
let cost = rows.reduce((t, r) => t + (r.cost ?? 0), 0);
if (judge && existsSync(judge)) {
  const a = JSON.parse(readFileSync(judge, 'utf8')).results?.stats?.tokenUsage?.assertions ?? {};
  cost += ((a.prompt ?? 0) * 2 + (a.completion ?? 0) * 10) / 1e6;
}
console.log(cost.toFixed(6));

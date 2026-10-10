// Proves the objective checks work, with no API calls:
//   1. every reference answer passes every check;
//   2. every seeded fault fails, and in the category it was aimed at.
// Usage: node scripts/self-test.mjs <reference results.json> <faulty results.json>
import { readFileSync } from 'node:fs';
import { FAULTS } from '../providers/faulty.mjs';

const [refFile, faultyFile] = process.argv.slice(2);
if (!refFile || !faultyFile) { console.error('usage: node scripts/self-test.mjs <reference.json> <faulty.json>'); process.exit(2); }
const rows = (f) => JSON.parse(readFileSync(f, 'utf8')).results.results;
const failed = (r) => (r.gradingResult?.componentResults ?? []).filter((c) => !c.pass);

let bad = 0;
const ref = rows(refFile);
for (const r of ref) {
  const f = failed(r);
  if (f.length || r.error) { bad++; console.log(`FAIL reference ${r.vars.case_id}: ${r.error ?? f.map((c) => `${c.assertion.metric}: ${c.reason}`).join(' | ')}`); }
}
console.log(`reference: ${ref.length - bad}/${ref.length} pass every check`);

const faulty = rows(faultyFile); let caught = 0;
for (const r of faulty) {
  const id = r.vars.case_id; const [label, want] = FAULTS[id];
  const metrics = failed(r).map((c) => c.assertion.metric);
  const ok = metrics.includes(want) && !r.success;
  if (ok) caught++; else { bad++; console.log(`MISSED ${id} "${label}": expected ${want} to fail, failed: ${metrics.join(', ') || 'nothing'}`); }
}
console.log(`seeded faults: ${caught}/${faulty.length} caught in the intended category`);
process.exit(bad ? 1 : 0);

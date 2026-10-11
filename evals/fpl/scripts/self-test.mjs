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

// Direct checks of paths a single seeded fault per case can't reach.
const { rankingClaims, provenance, numbers } = await import('../assertions/objective.mjs');
const { default: loadTests } = await import('../tests/load-tests.mjs');
const { reference } = await import('../providers/_common.mjs');
const tests = Object.fromEntries(loadTests().map((t) => [t.vars.case_id, t]));
const v2 = (id) => ({ vars: tests[id].vars, prompt: 'superlatives contract (v2)' });
const refAns = reference();
const direct = [
  ['T03 comparison word with no superlatives entry', () => rankingClaims(JSON.stringify({ ...refAns.T03, superlatives: [] }), v2('T03'))],
  ['T03 "over" leaves out the true winner', () => rankingClaims(JSON.stringify({ ...refAns.T03, superlatives: [{ ...refAns.T03.superlatives[0], winner: 'Arsenal', over: refAns.T03.superlatives[0].over.filter((o) => o.name !== 'Man City') }, refAns.T03.superlatives[1]] }), v2('T03'))],
  ['T08 "#n" pointing at a later fact', () => provenance(JSON.stringify({ ...refAns.T08, facts: [{ ...refAns.T08.facts[2], inputs: ['#4', '#5'] }, ...refAns.T08.facts.slice(3)] }), v2('T08'))],
  ['T08 calculation built on a wrong calculation', () => numbers(JSON.stringify({ ...refAns.T08, facts: [{ ...refAns.T08.facts[0], value: 25 }, ...refAns.T08.facts.slice(1)] }), v2('T08'))],
];
const expectPass = new Set(); // every direct check must fail
let directOk = 0;
for (const [label, fn] of direct) {
  const r = fn(); const ok = expectPass.has(label) ? r.pass : !r.pass;
  if (ok) directOk++; else { bad++; console.log(`DIRECT ${label}: ${r.pass ? 'passed' : 'failed'} (${r.reason})`); }
}
console.log(`direct checks: ${directOk}/${direct.length} caught`);
process.exit(bad ? 1 : 0);

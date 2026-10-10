// Prints each case's question, computed expectations and context size, or
// with --context <id> the full DATA block the model will see.
import { buildCases } from '../lib/cases.mjs';

const cases = buildCases();
const i = process.argv.indexOf('--context');
if (i > 0) {
  const c = cases.find((x) => x.id === process.argv[i + 1]);
  console.log(c ? c.ctx.render() : `no case ${process.argv[i + 1]}`);
} else {
  for (const c of cases) {
    const e = { ...c.expected };
    for (const [k, v] of Object.entries(e)) if (v instanceof RegExp) e[k] = String(v);
    console.log(`${c.id} [${c.category}] ${c.question}\n   ids: ${c.ctx.values.size}, chars: ${c.ctx.render().length}\n   expected: ${JSON.stringify(e)}\n`);
  }
}

// Offline provider: replays the outputs recorded in an earlier Promptfoo run
// (set REPLAY_FROM to its JSON output file). Used by the qualitative judge so
// it grades exactly the answers the objective checks saw, without generating
// new ones. Reports zero tokens: replaying costs nothing.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './_common.mjs';

let byCase = null;
function load() {
  if (byCase) return byCase;
  const file = process.env.REPLAY_FROM;
  if (!file) throw new Error('Set REPLAY_FROM to a Promptfoo JSON results file (e.g. results/live-2026-10-10.json).');
  const data = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));
  byCase = {};
  for (const r of data.results?.results ?? []) {
    const id = r.vars?.case_id ?? r.testCase?.vars?.case_id;
    if (id) byCase[id] = r.response?.output ?? r.output;
  }
  return byCase;
}

export default class ReplayProvider {
  id() { return 'replay'; }
  async callApi(_prompt, context) {
    const out = load()[context?.vars?.case_id];
    if (out == null) return { error: `no recorded output for ${context?.vars?.case_id} in ${process.env.REPLAY_FROM}` };
    return { output: typeof out === 'string' ? out : JSON.stringify(out), tokenUsage: { prompt: 0, completion: 0, total: 0 }, cost: 0 };
  }
}

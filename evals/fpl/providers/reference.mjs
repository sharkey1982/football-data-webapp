// Offline provider: returns the hand-written reference answer for each case.
// Every objective check should pass on these; if one fails, the check (or the
// reference) is wrong. Token counts and cost are estimates (see _common.mjs).
import { reference, usage } from './_common.mjs';

export default class ReferenceProvider {
  id() { return 'reference-answers'; }
  async callApi(prompt, context) {
    const ans = reference()[context?.vars?.case_id];
    if (!ans) return { error: `no reference answer for ${context?.vars?.case_id}` };
    const output = JSON.stringify(ans);
    return { output, ...usage(prompt, output), metadata: { estimated_usage: true } };
  }
}

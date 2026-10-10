// Offline provider: the reference answer with ONE seeded fault per case. Each
// fault is aimed at one check category, so a run shows whether every check
// actually catches what it is meant to catch (scripts/self-test.mjs reads it).
import { reference, usage } from './_common.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));

// case -> [fault label, category that must fail, mutate(answer) -> string output]
export const FAULTS = {
  T01: ['overconfident on a coin flip', 'task_correctness', (a) => { a.confidence = 'high'; return JSON.stringify(a); }],
  T02: ['value miscopied from the data', 'numerical_accuracy', (a) => { a.facts[0].value = 6.2; a.answer = a.answer.replace('6.02', '6.2'); return JSON.stringify(a); }],
  T03: ['cites a source id that does not exist', 'source_provenance', (a) => { a.facts[0].inputs[0] = 'F999.mkt_home'; return JSON.stringify(a); }],
  T04: ['arithmetic error in a calculation', 'numerical_accuracy', (a) => { a.facts[5].value = 10.52; a.answer = a.answer.replace('10.32', '10.52'); return JSON.stringify(a); }],
  T05: ['JSON wrapped in a code fence', 'output_structure', (a) => '```json\n' + JSON.stringify(a, null, 2) + '\n```'],
  T06: ['invents a projection for a missing player', 'missing_data', (a) => {
    a.answer_type = 'answered'; a.missing_data = [];
    a.answer = 'FixtureShark projects Saka at 7.07 points in GW6 and Ollie Watkins at 5.4 points.';
    a.facts.push({ source_id: 'P12.xpts', value: 5.4, meaning: 'Watkins projected points' });
    return JSON.stringify(a);
  }],
  T07: ['drops the link and runs long', 'task_correctness', (a) => {
    a.answer = a.answer.replace(/ Side by side here: \S+$/, '') + ' ' + 'Worth keeping an eye on his minutes in training and the team news before the deadline too. '.repeat(4).trim();
    return JSON.stringify(a);
  }],
  T08: ['recommends taking the hit', 'task_correctness', (a) => { a.recommendation = 'Yes, take the hit'; return JSON.stringify(a); }],
  T09: ['states a number that is not in the data', 'numerical_accuracy', (a) => { a.answer += ' Over 40,000 managers already ignore FDR.'; a.answer = a.answer.replace('40,000', '40000'); return JSON.stringify(a); }],
  T10: ['missing required fields', 'output_structure', (a) => { delete a.confidence; delete a.data_as_of; return JSON.stringify(a); }],
};

export default class FaultyProvider {
  id() { return 'reference-with-seeded-faults'; }
  async callApi(prompt, context) {
    const id = context?.vars?.case_id; const ans = reference()[id];
    if (!ans || !FAULTS[id]) return { error: `no reference/fault for ${id}` };
    const output = FAULTS[id][2](clone(ans));
    return { output, ...usage(prompt, output), metadata: { fault: FAULTS[id][0], should_fail: FAULTS[id][1], estimated_usage: true } };
  }
}

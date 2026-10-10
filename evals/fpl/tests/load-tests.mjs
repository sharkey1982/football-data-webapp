// Builds Promptfoo test cases from lib/cases.mjs. Each test gets:
//   vars.context / question / data_as_of   what the model sees
//   vars.context_values                    every source id and its value (for the checks)
//   vars.expected                          the case's expectations (regexes as {source, flags})
// and the same five deterministic assertions. They are the pass/fail verdict;
// the qualitative judge runs separately (promptfooconfig.judge.yaml).
import { buildCases } from '../lib/cases.mjs';

const DATA_AS_OF = 'FPL gameweek 6 deadline, 10 Oct 2026 10:00 UTC (projections captured 09:00 UTC, model leaguewide_v6); fixtures and article figures as stored on 10 Oct 2026';

function serialise(v) {
  if (v instanceof RegExp) return { $re: v.source, flags: v.flags };
  if (Array.isArray(v)) return v.map(serialise);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, serialise(x)]));
  return v;
}

const CHECKS = [
  ['structure', 'output_structure'],
  ['provenance', 'source_provenance'],
  ['numbers', 'numerical_accuracy'],
  ['missingData', 'missing_data'],
  ['task', 'task_correctness'],
];

export default function loadTests() {
  return buildCases().map((c) => ({
    description: c.description,
    vars: {
      case_id: c.id,
      question: c.question,
      context: c.ctx.render(),
      data_as_of: DATA_AS_OF,
      context_values: JSON.stringify(c.ctx.toJSON()),
      expected: JSON.stringify(serialise(c.expected)),
    },
    metadata: { case_id: c.id, category: c.category },
    assert: CHECKS.map(([fn, metric]) => ({ type: 'javascript', value: `file://assertions/objective.mjs:${fn}`, metric })),
  }));
}

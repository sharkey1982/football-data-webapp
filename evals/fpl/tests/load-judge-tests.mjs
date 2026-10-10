// The same ten cases, graded only by an LLM rubric for reasoning and usefulness.
// Advisory: run separately from the objective checks and reported beside them.
import loadTests from './load-tests.mjs';

const REASONING = `You are reviewing an FPL analysis answer for FixtureShark. The answer is a JSON object; judge its "answer" text (and "recommendation").
Reasoning: does the conclusion follow from the numbers it cites? Does it weigh the relevant factors for this question (for example minutes risk, fixtures, the size of a gap), say when options are close, and avoid reasoning the data cannot support?
Do NOT judge whether numbers are correct; that is checked elsewhere.
The question was: {{question}}
Score 1.0 for sound, well-weighed reasoning; 0.5 for acceptable but thin or partly unsupported; 0.0 for reasoning that does not follow.`;

const USEFULNESS = `You are reviewing an FPL analysis answer for FixtureShark. The answer is a JSON object; judge its "answer" text.
Usefulness: would an experienced FPL manager find it clear, direct and actionable for the question asked, at an appropriate length, with no padding? For a Reddit draft, would it read naturally as a helpful reply rather than an advert?
Do NOT judge whether numbers are correct; that is checked elsewhere.
The question was: {{question}}
Score 1.0 for clearly useful; 0.5 for usable but could be clearer or more direct; 0.0 for not useful.`;

export default function loadJudgeTests() {
  return loadTests().map((t) => ({
    ...t,
    assert: [
      { type: 'llm-rubric', value: REASONING, metric: 'quality_reasoning', threshold: 0.5 },
      { type: 'llm-rubric', value: USEFULNESS, metric: 'quality_usefulness', threshold: 0.5 },
    ],
  }));
}

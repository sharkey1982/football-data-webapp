// Shared helpers for the offline providers. No network.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const reference = () => JSON.parse(readFileSync(join(ROOT, 'fixtures', 'reference', 'answers.json'), 'utf8'));

// Rough token estimate (about 3.5 characters a token for this English/JSON mix).
// Offline runs report these so the cost table has something to show; they are
// labelled as estimates in the report and replaced by real counts in a live run.
export const estTokens = (s) => Math.ceil(String(s).length / 3.5);
// claude-sonnet-5 list price, USD per token (same as Promptfoo and the AI Lab edge function).
export const PRICE = { in: 2 / 1e6, out: 10 / 1e6 };

export function usage(prompt, output) {
  const p = estTokens(prompt); const c = estTokens(output);
  return { tokenUsage: { prompt: p, completion: c, total: p + c, numRequests: 1 }, cost: p * PRICE.in + c * PRICE.out };
}

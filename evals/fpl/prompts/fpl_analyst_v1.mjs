// Prompt for the FPL eval: system rules (system_fpl_analyst_v1.md) plus a
// user turn holding the frozen DATA block and the question. Returned as chat
// messages, so Promptfoo sends them to the provider unchanged.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SYSTEM = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'system_fpl_analyst_v1.md'), 'utf8').trim();

export default function fplAnalystV1({ vars }) {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `DATA (frozen snapshot: ${vars.data_as_of})\n\n${vars.context}\n\nEND OF DATA\n\nQuestion: ${vars.question}`,
    },
  ];
}

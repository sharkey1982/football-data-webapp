// Summarises a Promptfoo results file as Markdown: pass rate, failures by
// category, per-case detail, tokens and cost. Optionally adds advisory judge
// scores from a second results file; they are shown beside the objective
// verdict and never change it.
// Usage: node scripts/report.mjs <results.json> [--judge <judge results.json>] [--title "..."]
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args[0];
const arg = (k) => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : null; };
if (!file) { console.error('usage: node scripts/report.mjs <results.json> [--judge <file>] [--title "..."]'); process.exit(2); }

const ORDER = ['output_structure', 'source_provenance', 'numerical_accuracy', 'missing_data', 'task_correctness'];
const data = JSON.parse(readFileSync(file, 'utf8'));
const rows = data.results.results.slice().sort((a, b) => String(a.vars.case_id).localeCompare(String(b.vars.case_id)));
const comp = (r) => r.gradingResult?.componentResults ?? [];

const passed = rows.filter((r) => r.success).length;
const errors = rows.filter((r) => r.error && !comp(r).length).length;
const estimated = rows.some((r) => r.response?.metadata?.estimated_usage);
const provider = rows[0]?.provider?.label || rows[0]?.provider?.id || 'unknown';

const tok = { prompt: 0, completion: 0, total: 0, cached: 0 };
let cost = 0;
for (const r of rows) {
  const u = r.response?.tokenUsage ?? r.tokenUsage ?? {};
  tok.prompt += u.prompt ?? 0; tok.completion += u.completion ?? 0; tok.total += u.total ?? 0; tok.cached += u.cached ?? 0;
  cost += r.cost ?? 0;
}

const out = [];
const title = arg('--title') ?? 'FPL eval results';
out.push(`# ${title}`, '');
out.push(`- Results file: \`${file}\``);
out.push(`- Provider: ${provider}`);
out.push(`- Run at: ${data.createdAt ?? data.results?.timestamp ?? 'unknown'}`);
out.push(`- Cases: ${rows.length}; passed every objective check: **${passed}/${rows.length} (${Math.round((100 * passed) / rows.length)}%)**${errors ? `; provider errors: ${errors}` : ''}`, '');

out.push('## Pass rate by check', '', '| Check | Passed | Failed |', '|---|---|---|');
for (const m of ORDER) {
  const cs = rows.map((r) => comp(r).find((c) => c.assertion?.metric === m)).filter(Boolean);
  out.push(`| ${m} | ${cs.filter((c) => c.pass).length} | ${cs.filter((c) => !c.pass).length} |`);
}

// Primary category: the first failing check in ORDER (later failures often follow from it).
const primary = {};
for (const r of rows.filter((x) => !x.success)) {
  const f = ORDER.find((m) => comp(r).some((c) => c.assertion?.metric === m && !c.pass)) ?? (r.error ? 'provider_error' : 'other');
  primary[f] = (primary[f] ?? 0) + 1;
}
out.push('', '## Failure categories (first failing check per case)', '');
if (!Object.keys(primary).length) out.push('None.');
else { out.push('| Category | Cases |', '|---|---|'); for (const [k, v] of Object.entries(primary)) out.push(`| ${k} | ${v} |`); }

let judge = null;
if (arg('--judge')) {
  judge = {};
  for (const r of JSON.parse(readFileSync(arg('--judge'), 'utf8')).results.results) {
    judge[r.vars.case_id] = Object.fromEntries(comp(r).map((c) => [c.assertion?.metric, c.score]));
  }
}

out.push('', '## Cases', '', `| Case | Category | Result | Failed checks |${judge ? ' Reasoning (advisory) | Usefulness (advisory) |' : ''}`, `|---|---|---|---|${judge ? '---|---|' : ''}`);
for (const r of rows) {
  const f = comp(r).filter((c) => !c.pass).map((c) => `**${c.assertion?.metric}**: ${String(c.reason).replace(/\|/g, '/').slice(0, 300)}`);
  const j = judge?.[r.vars.case_id];
  out.push(`| ${r.vars.case_id} | ${r.metadata?.category ?? r.testCase?.metadata?.category ?? ''} | ${r.success ? 'pass' : r.error && !comp(r).length ? 'error' : 'FAIL'} | ${f.join('<br>') || (r.error ? String(r.error).slice(0, 200) : '')} |${judge ? ` ${j?.quality_reasoning ?? '-'} | ${j?.quality_usefulness ?? '-'} |` : ''}`);
}

out.push('', `## Tokens and cost${estimated ? ' (ESTIMATED: offline provider, ~3.5 characters a token)' : ''}`, '');
out.push('| | Tokens |', '|---|---|');
out.push(`| Prompt | ${tok.prompt.toLocaleString('en-GB')} |`, `| Completion | ${tok.completion.toLocaleString('en-GB')} |`, `| Total | ${tok.total.toLocaleString('en-GB')} |`);
out.push('', `Cost: **$${cost.toFixed(4)}** for ${rows.length} cases ($${(cost / rows.length).toFixed(4)} a case), at claude-sonnet-5 list prices ($2 / $10 per million input / output tokens).`);
console.log(out.join('\n'));

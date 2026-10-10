// Deterministic checks for the FPL eval. No model is involved in any of them.
// Each is a Promptfoo javascript assertion: (output, context) -> GradingResult.
//
//   structure    output_structure     valid JSON in the agreed shape
//   provenance   source_provenance    every fact cites a real source id; required ids cited
//   numbers      numerical_accuracy   fact values match their sources; calculations recompute;
//                                     every number in the answer text is traceable; required
//                                     figures stated correctly
//   missingData  missing_data         answer_type, missing items named, nothing claimed about absent players
//   task         task_correctness     recommendation, ranking order, confidence, required content, length

const TOL = 0.0051; // copied values must match to the precision shown in the data
const CALC_TOL = 0.011; // calculated values may be rounded to 2 decimals

// ------------------------------------------------------------------ parsing
export function parse(output) {
  if (output && typeof output === 'object') return { ok: true, data: output };
  const text = String(output ?? '').trim();
  try { return { ok: true, data: JSON.parse(text) }; } catch { /* fall through */ }
  return { ok: false, error: `not a single JSON object (starts: ${JSON.stringify(text.slice(0, 60))})` };
}

const vars = (context) => context?.vars ?? {};
const valuesOf = (context) => JSON.parse(vars(context).context_values ?? '{}');
function expectedOf(context) {
  const revive = (v) => {
    if (Array.isArray(v)) return v.map(revive);
    if (v && typeof v === 'object') return v.$re != null ? new RegExp(v.$re, v.flags) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
    return v;
  };
  return revive(JSON.parse(vars(context).expected ?? '{}'));
}

function result(problems, okReason) {
  return problems.length
    ? { pass: false, score: 0, reason: problems.join(' | ') }
    : { pass: true, score: 1, reason: okReason };
}

function withParsed(output, fn) {
  const p = parse(output);
  if (!p.ok) return { pass: false, score: 0, reason: `skipped: ${p.error}` };
  return fn(p.data);
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
// In a "sum", an input written "-ID" is subtracted.
const stripSign = (id) => String(id).replace(/^-/, '');
const signedValue = (values, id) => (String(id).startsWith('-') ? -values[stripSign(id)] : values[id]);

// ------------------------------------------------------------------ structure
export function structure(output) {
  const p = parse(output);
  if (!p.ok) return { pass: false, score: 0, reason: p.error };
  const d = p.data; const problems = [];
  if (typeof d !== 'object' || Array.isArray(d) || d === null) return { pass: false, score: 0, reason: 'top level is not an object' };
  if (typeof d.answer !== 'string' || !d.answer.trim()) problems.push('answer missing or empty');
  if (!['answered', 'partial', 'refused'].includes(d.answer_type)) problems.push(`answer_type ${JSON.stringify(d.answer_type)} not answered/partial/refused`);
  if (!(d.recommendation === null || typeof d.recommendation === 'string')) problems.push('recommendation must be a string or null');
  if (!['high', 'medium', 'low'].includes(d.confidence)) problems.push(`confidence ${JSON.stringify(d.confidence)} not high/medium/low`);
  if (!Array.isArray(d.ranking)) problems.push('ranking is not an array');
  else d.ranking.forEach((r, i) => { if (!r || typeof r.name !== 'string') problems.push(`ranking[${i}] has no name`); });
  if (!Array.isArray(d.facts)) problems.push('facts is not an array');
  else d.facts.forEach((f, i) => {
    if (!f || typeof f.source_id !== 'string') problems.push(`facts[${i}] has no source_id`);
    else if (f.source_id === 'calc' && (!Array.isArray(f.inputs) || typeof f.operation !== 'string')) problems.push(`facts[${i}] calc without operation/inputs`);
    if (!f || f.value === undefined) problems.push(`facts[${i}] has no value`);
  });
  if (!Array.isArray(d.missing_data)) problems.push('missing_data is not an array');
  if (typeof d.data_as_of !== 'string' || !d.data_as_of.trim()) problems.push('data_as_of missing');
  return result(problems, 'valid JSON in the agreed shape');
}

// ------------------------------------------------------------------ provenance
export function provenance(output, context) {
  return withParsed(output, (d) => {
    const values = valuesOf(context); const exp = expectedOf(context); const problems = [];
    const facts = Array.isArray(d.facts) ? d.facts : [];
    for (const f of facts) {
      if (!f?.source_id) continue;
      if (f.source_id === 'calc') {
        const bad = (f.inputs ?? []).map(stripSign).filter((id) => !(id in values));
        if (bad.length) problems.push(`calc "${f.meaning ?? ''}" uses unknown ids ${bad.join(', ')}`);
      } else if (!(f.source_id in values)) problems.push(`unknown source id ${f.source_id}`);
    }
    for (const r of Array.isArray(d.ranking) ? d.ranking : []) {
      if (r?.source_id && r.source_id !== 'calc' && !(r.source_id in values)) problems.push(`ranking cites unknown id ${r.source_id}`);
    }
    const cited = new Set(facts.map((f) => f?.source_id).concat(facts.flatMap((f) => (f?.inputs ?? []).map(stripSign))));
    const missing = (exp.must_cite ?? []).filter((id) => !cited.has(id));
    if (missing.length) problems.push(`did not cite required source(s) ${missing.join(', ')}`);
    return result(problems, `${facts.length} fact(s), all with valid source ids`);
  });
}

// ------------------------------------------------------------------ numbers
function calc(op, xs) {
  switch (op) {
    case 'sum': return xs.reduce((a, b) => a + b, 0);
    case 'difference': return xs[0] - xs.slice(1).reduce((a, b) => a + b, 0);
    case 'mean': return xs.reduce((a, b) => a + b, 0) / xs.length;
    case 'ratio': return xs.length === 2 && xs[1] !== 0 ? xs[0] / xs[1] : NaN;
    case 'min': return Math.min(...xs);
    case 'max': return Math.max(...xs);
    default: return NaN;
  }
}

const decimals = (s) => (s.includes('.') ? s.split('.')[1].length : 0);
const roundTo = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

// Numbers in prose that are not data claims: gameweeks, dates, seasons, links, the question's own numbers.
export function claimNumbers(text, questionNums) {
  const cleaned = String(text)
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b(GW|gameweeks?|weeks?)\s*\d+(\s*(-|–|to|and)\s*(GW)?\s*\d+)?/gi, ' ')
    .replace(/\b\d{4}\/\d{2}\b/g, ' ')
    .replace(/\b20\d\d\b/g, ' ')
    .replace(/\b\d{1,2}(st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*/gi, ' ')
    .replace(/\b(top|bottom|first|last)[- ]\d+\b/gi, ' ');
  const out = [];
  for (const m of cleaned.matchAll(/(?<![\w.])-?\d+(?:\.\d+)?/g)) {
    const s = m[0].replace(/^-/, ''); const n = Number(s);
    if (!s.includes('.') && n <= 10) continue; // small counts ("two options", "3 per club")
    if (questionNums.some((q) => Math.abs(q - n) < 1e-9)) continue;
    out.push({ text: m[0], n, d: decimals(s) });
  }
  return out;
}

export function numbers(output, context) {
  return withParsed(output, (d) => {
    const values = valuesOf(context); const exp = expectedOf(context); const problems = [];
    const facts = Array.isArray(d.facts) ? d.facts : [];
    const known = Object.values(values).filter(isNum);
    // Numbers written in the data's text (e.g. "75% chance" in FPL news, "29334 starts") count as data too.
    const contextText = String(vars(context).context ?? '').replace(/\[[^\]]*\]/g, ' ');
    for (const m of contextText.matchAll(/(?<![\w.])\d+(?:\.\d+)?/g)) known.push(Number(m[0]));
    let checked = 0;
    for (const f of facts) {
      if (!f?.source_id) continue;
      const v = Number(f.value);
      if (f.source_id === 'calc') {
        const xs = (f.inputs ?? []).map((id) => signedValue(values, id));
        if (!xs.length || xs.some((x) => !isNum(x))) continue; // provenance reports unknown ids
        const want = calc(f.operation, xs);
        if (!Number.isFinite(want)) problems.push(`calc "${f.meaning ?? ''}": unknown operation ${f.operation}`);
        else if (!(Math.abs(v - want) <= CALC_TOL)) problems.push(`calc "${f.meaning ?? ''}" = ${f.value}, recomputed ${roundTo(want, 3)}`);
        else known.push(want, v);
        checked++;
      } else if (f.source_id in values && isNum(values[f.source_id])) {
        if (!(Math.abs(v - values[f.source_id]) <= TOL)) problems.push(`${f.source_id} given as ${f.value}, source says ${values[f.source_id]}`);
        checked++;
      }
    }
    for (const r of Array.isArray(d.ranking) ? d.ranking : []) {
      if (r?.source_id in values && isNum(r.value) && Math.abs(r.value - values[r.source_id]) > TOL) problems.push(`ranking value for ${r.name} is ${r.value}, ${r.source_id} says ${values[r.source_id]}`);
    }
    // Every number in the answer text must be traceable to the data (allowing rounding and %).
    const qNums = [...String(vars(context).question ?? '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    const traceable = (c) => known.some((k) => roundTo(k, c.d) === c.n || roundTo(k * 100, c.d) === c.n || roundTo(Math.abs(k), c.d) === c.n);
    const untraced = claimNumbers(d.answer ?? '', qNums).filter((c) => !traceable(c));
    if (untraced.length) problems.push(`answer has number(s) not in the data or facts: ${untraced.map((c) => c.text).join(', ')}`);
    // Required figures must be stated (answer or facts) and be right.
    const stated = claimNumbers(d.answer ?? '', []).map((c) => c.n).concat(facts.map((f) => Number(f?.value)).filter(Number.isFinite));
    for (const m of exp.must_state ?? []) {
      if (!stated.some((n) => Math.abs(n - m.value) <= m.tol)) problems.push(`did not state ${m.why} (${m.value})`);
    }
    return result(problems, `${checked} fact value(s) match their sources; answer numbers traceable`);
  });
}

// ------------------------------------------------------------------ missing data
export function missingData(output, context) {
  return withParsed(output, (d) => {
    const exp = expectedOf(context); const problems = [];
    if (exp.answer_type && !exp.answer_type.includes(d.answer_type)) problems.push(`answer_type ${d.answer_type}, expected ${exp.answer_type.join(' or ')}`);
    const md = (Array.isArray(d.missing_data) ? d.missing_data : []).join(' ');
    for (const term of exp.missing_data ?? []) {
      if (!new RegExp(term, 'i').test(md)) problems.push(`missing_data does not mention ${term}`);
      if (!new RegExp(term, 'i').test(d.answer ?? '')) problems.push(`answer does not tell the user ${term} is missing`);
    }
    for (const name of exp.no_facts_about ?? []) {
      const bad = (Array.isArray(d.facts) ? d.facts : []).filter((f) => new RegExp(name, 'i').test(String(f?.meaning ?? '')));
      if (bad.length) problems.push(`claims facts about ${name}, who is not in the data`);
      const near = new RegExp(`${name}[^.\\n]{0,60}?\\b\\d+(\\.\\d+)?\\s*(points|pts|xp)`, 'i');
      if (near.test(d.answer ?? '')) problems.push(`answer gives a number for ${name}, who is not in the data`);
    }
    if (!exp.missing_data && !exp.answer_type?.includes('partial') && d.answer_type === 'refused') problems.push('refused a question the data can answer');
    return result(problems, 'missing data handled');
  });
}

// ------------------------------------------------------------------ task
export function task(output, context) {
  return withParsed(output, (d) => {
    const exp = expectedOf(context); const problems = [];
    const rec = String(d.recommendation ?? '');
    if (exp.recommendation && !exp.recommendation.test(rec)) problems.push(`recommendation "${rec}" does not match ${exp.recommendation}`);
    if (exp.not_recommendation && exp.not_recommendation.test(rec)) problems.push(`recommendation "${rec}" should not match ${exp.not_recommendation}`);
    if (exp.ranking_order) {
      const names = (Array.isArray(d.ranking) ? d.ranking : []).map((r) => String(r?.name ?? ''));
      const pos = exp.ranking_order.map((n) => names.findIndex((x) => x.toLowerCase().includes(n.toLowerCase())));
      if (pos.some((p) => p < 0)) problems.push(`ranking is missing ${exp.ranking_order.filter((_, i) => pos[i] < 0).join(', ')}`);
      else if (pos.some((p, i) => i > 0 && p < pos[i - 1])) problems.push(`ranking order ${names.join(' > ')}; expected ${exp.ranking_order.join(' > ')}`);
    }
    if (exp.confidence_not?.includes(d.confidence)) problems.push(`confidence "${d.confidence}" overstated for a close call`);
    for (const r of exp.answer_regex ?? []) if (!r.re.test(d.answer ?? '')) problems.push(`answer misses: ${r.why}`);
    if (exp.max_words) {
      const words = String(d.answer ?? '').trim().split(/\s+/).filter(Boolean).length;
      if (words > exp.max_words) problems.push(`answer is ${words} words, limit ${exp.max_words}`);
    }
    return result(problems, 'task requirements met');
  });
}

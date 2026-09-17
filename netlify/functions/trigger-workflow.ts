// ============================================================================
// netlify/functions/trigger-workflow.ts
//
// Proxy for triggering the repo's GitHub Actions workflows from the
// frontend. Exists because the GitHub token those workflows need (write
// access to trigger runs) can never be embedded in client-side JS -- this
// function holds it server-side only, read from the GITHUB_ACTIONS_TOKEN
// environment variable (set in Netlify's dashboard, never committed).
//
// Only the four workflows this app actually uses are allowed, hardcoded
// below -- the request body can select WHICH of these four to run and
// with what inputs, but can't name an arbitrary workflow file. This is a
// bound on blast radius, not a promise of secrecy: this endpoint has no
// auth of its own (anything embedded in the frontend bundle is
// necessarily public, the same as any button on this site), so the real
// protection is that it can only ever do one of these four specific,
// known-safe things, each of which just re-derives projections from
// existing data -- not something that can corrupt data or escalate
// further even if called directly and repeatedly. If tighter access
// control is ever wanted, Netlify's own site-wide password protection is
// the straightforward lever, not something to bolt on here.
// ============================================================================

const ALLOWED_WORKFLOWS: Record<string, { file: string; inputKeys: string[] }> = {
  'simulate-fixture-bonus': { file: 'simulate-fixture-bonus.yml', inputKeys: ['from_matchweek', 'to_matchweek'] },
  'simulate-final-table': { file: 'simulate-final-table.yml', inputKeys: ['season_id'] },
  'refresh-fpl-projections': { file: 'refresh-fpl-projections.yml', inputKeys: ['from_matchweek', 'to_matchweek'] },
};

const REPO_OWNER = 'sharkey1982';
const REPO_NAME = 'football-data-webapp';

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: 'GITHUB_ACTIONS_TOKEN is not configured on this deploy' }), { status: 500 });
  }

  let body: { workflow?: string; inputs?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const selected = body.workflow ? ALLOWED_WORKFLOWS[body.workflow] : undefined;
  if (!selected) {
    return new Response(JSON.stringify({ error: `Unknown workflow. Allowed: ${Object.keys(ALLOWED_WORKFLOWS).join(', ')}` }), { status: 400 });
  }

  // Only pass through inputs this workflow actually declares -- drops
  // anything else silently rather than forwarding arbitrary keys to the
  // GitHub API.
  const inputs: Record<string, string> = {};
  for (const key of selected.inputKeys) {
    if (body.inputs?.[key] !== undefined) inputs[key] = String(body.inputs[key]);
  }

  const dispatchResp = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${selected.file}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref: 'main', inputs }),
  });

  if (dispatchResp.status !== 204) {
    const text = await dispatchResp.text();
    return new Response(JSON.stringify({ error: `GitHub API returned ${dispatchResp.status}: ${text}` }), { status: 502 });
  }

  return new Response(JSON.stringify({ triggered: selected.file }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

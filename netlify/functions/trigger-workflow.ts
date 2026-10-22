// ============================================================================
// netlify/functions/trigger-workflow.ts
//
// Proxy for triggering the repo's GitHub Actions workflows from the
// frontend. Exists because the GitHub token those workflows need (write
// access to trigger runs) can never be embedded in client-side JS -- this
// function holds it server-side only, read from the GITHUB_ACTIONS_TOKEN
// environment variable (set in Netlify's dashboard, never committed).
//
// AUTH. This endpoint previously had none, on the argument that blast
// radius was already bounded to three known-safe re-derivation workflows
// so anonymous access couldn't corrupt anything. That argument was half
// right and is no longer the policy: nothing here can corrupt data, but
// an anonymous caller could still burn unlimited GitHub Actions minutes
// and start concurrent refreshes that race each other. Correctness isn't
// the only thing worth protecting -- cost and availability are too.
//
// So every request now needs a Supabase access token belonging to an
// ADMIN. The admin check is server-side via is_admin(): a client-supplied
// "isAdmin" flag would be worthless, since anything the browser can send
// an attacker can send too. Three independent limits apply:
//   1. valid Supabase session (token verified against Supabase, not
//      decoded locally -- a locally-decoded JWT proves nothing)
//   2. is_admin() true for that user
//   3. per-user rate limit, below
//
// GitHub errors are deliberately not passed through to the caller: they
// can carry repo/token detail. They're logged server-side instead.
//
// MACHINE PATH (audit P-01, 22 Oct 2026). GitHub's own cron starts the
// deadline-critical workflows hours late, so pg_cron dispatches them on time
// (private.dispatch_due_workflows). pg_cron has no Supabase session; it sends
// the header x-workflow-token instead, compared in constant time with the
// env var WORKFLOW_TRIGGER_TOKEN (the same value is the Vault secret
// workflow_trigger_token; generated in the database, never in the repo).
// A wrong or missing machine token gets the same 401 as a bad session, and
// the machine path may only start the scheduled workflows with their
// scheduled inputs (MACHINE_WORKFLOWS), never the admin-only ones.
// ============================================================================

import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

type WorkflowSpec = { file: string; inputKeys: string[] };

const ALLOWED_WORKFLOWS: Record<string, WorkflowSpec> = {
  'simulate-fixture-bonus': { file: 'simulate-fixture-bonus.yml', inputKeys: ['from_matchweek', 'to_matchweek'] },
  'simulate-final-table': { file: 'simulate-final-table.yml', inputKeys: ['season_id'] },
  'refresh-fpl-projections': { file: 'refresh-fpl-projections.yml', inputKeys: ['from_matchweek', 'to_matchweek'] },
  // The full scheduled pipeline (10 gameweeks, no site rebuild): Minutes
  // Outlook's "Re-run projections now" after an admin first-choice change.
  'fpl-projections-pipeline': { file: 'fpl-projections-pipeline.yml', inputKeys: [] },
  'ffs-team-news': { file: 'ffs-team-news.yml', inputKeys: [] },
};

// What pg_cron may start, with the inputs its slots send
// (private.workflow_dispatch_slots). rebuild_site is allowed only here: the
// morning pipeline slot is the one scheduled run that rebuilds the site.
export const MACHINE_WORKFLOWS: Record<string, WorkflowSpec> = {
  'fpl-projections-pipeline': { file: 'fpl-projections-pipeline.yml', inputKeys: ['rebuild_site'] },
  'ffs-team-news': { file: 'ffs-team-news.yml', inputKeys: [] },
  'daily-import': { file: 'daily-import.yml', inputKeys: [] },
  'gameweek-report': { file: 'gameweek-report.yml', inputKeys: ['auto'] },
};

const BOOLEAN_INPUTS = new Set(['rebuild_site', 'auto']);

const REPO_OWNER = 'sharkey1982';
const REPO_NAME = 'football-data-webapp';

// Every accepted input is a bounded integer. Anything outside its range
// is REJECTED rather than clamped: a silently corrected matchweek 900
// would start a long job the caller didn't ask for, and clamping hides
// a bug in whatever sent it.
const INPUT_RANGES: Record<string, { min: number; max: number }> = {
  from_matchweek: { min: 1, max: 38 },
  to_matchweek: { min: 1, max: 38 },
  season_id: { min: 1, max: 100 },
};

// These runs take 1-2 minutes and are idempotent re-derivations, so the
// limit exists to stop pile-ups and runaway Actions spend, not to ration
// legitimate use. In-memory and therefore per-instance: Netlify may run
// several, so this is a backstop that reduces damage, not a guarantee.
// A shared counter would need Supabase or a KV store -- worth doing only
// if this ever proves insufficient in practice.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
// pg_cron can have several slots due in the same minute (and retries).
const MACHINE_RATE_LIMIT_MAX = 12;
const recentCalls = new Map<string, number[]>();

function rateLimited(userId: string, max = RATE_LIMIT_MAX): boolean {
  const now = Date.now();
  const hits = (recentCalls.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= max) {
    recentCalls.set(userId, hits);
    return true;
  }
  hits.push(now);
  recentCalls.set(userId, hits);
  return false;
}

// Constant-time comparison; a length mismatch is a plain mismatch.
export function machineTokenMatches(supplied: string, expected: string | undefined): boolean {
  if (!expected || expected.length < 32 || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function checkAdmin(req: Request, supabaseUrl: string, supabaseKey: string): Promise<Response | null> {
  const accessToken = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!accessToken) return json({ error: 'Authentication required' }, 401);

  // Verified against Supabase rather than decoded here: only Supabase can
  // say whether this token is real, unexpired and unrevoked.
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user) return json({ error: 'Authentication required' }, 401);

  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
  if (adminError) {
    console.error('trigger-workflow: is_admin check failed', adminError.message);
    return json({ error: 'Could not verify permissions' }, 500);
  }
  // Same 403 whether the user isn't an admin or the flag is absent --
  // no signal about who is one.
  if (isAdmin !== true) return json({ error: 'Admin access required' }, 403);

  if (rateLimited(userData.user.id)) {
    return json({ error: 'Too many workflow triggers. Wait a minute and try again.' }, 429);
  }

  return null;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = process.env.GITHUB_ACTIONS_TOKEN;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !supabaseUrl || !supabaseKey) {
    console.error('trigger-workflow misconfigured: missing GITHUB_ACTIONS_TOKEN or Supabase env');
    return json({ error: 'Server is not configured for this operation' }, 500);
  }

  const machineHeader = (req.headers.get('x-workflow-token') ?? '').trim();
  let workflows: Record<string, WorkflowSpec> = ALLOWED_WORKFLOWS;
  if (machineHeader) {
    if (!machineTokenMatches(machineHeader, process.env.WORKFLOW_TRIGGER_TOKEN)) {
      return json({ error: 'Authentication required' }, 401);
    }
    if (rateLimited('machine:pg_cron', MACHINE_RATE_LIMIT_MAX)) {
      return json({ error: 'Too many workflow triggers. Wait a minute and try again.' }, 429);
    }
    workflows = MACHINE_WORKFLOWS;
  } else {
    const denied = await checkAdmin(req, supabaseUrl, supabaseKey);
    if (denied) return denied;
  }

  let body: { workflow?: string; inputs?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const selected = body.workflow && Object.hasOwn(workflows, body.workflow) ? workflows[body.workflow] : undefined;
  if (!selected) {
    return json({ error: `Unknown workflow. Allowed: ${Object.keys(workflows).join(', ')}` }, 400);
  }

  // Only this workflow's declared inputs are forwarded; unknown keys are
  // rejected rather than dropped, so a typo'd input surfaces instead of
  // silently running with a default.
  const supplied = body.inputs ?? {};
  const unknownKeys = Object.keys(supplied).filter((k) => !selected.inputKeys.includes(k));
  if (unknownKeys.length > 0) {
    return json({ error: `Unknown input(s) for ${body.workflow}: ${unknownKeys.join(', ')}` }, 400);
  }

  const inputs: Record<string, string> = {};
  for (const key of selected.inputKeys) {
    const raw = supplied[key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (BOOLEAN_INPUTS.has(key)) {
      if (typeof raw !== 'boolean') return json({ error: `Input "${key}" must be true or false` }, 400);
      inputs[key] = String(raw);
      continue;
    }
    const range = INPUT_RANGES[key];
    const value = Number(raw);
    // Number('') is 0 and Number('3abc') is NaN -- both must fail, hence
    // Number.isInteger rather than a truthiness check.
    if (!Number.isInteger(value) || (range && (value < range.min || value > range.max))) {
      return json({ error: `Input "${key}" must be an integer between ${range?.min ?? 1} and ${range?.max ?? 'n'}` }, 400);
    }
    inputs[key] = String(value);
  }

  // A range the wrong way round would run zero fixtures and look like a
  // silent no-op, which is worse than an error.
  if (inputs.from_matchweek && inputs.to_matchweek && Number(inputs.from_matchweek) > Number(inputs.to_matchweek)) {
    return json({ error: 'from_matchweek must not be greater than to_matchweek' }, 400);
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
    // Logged, not returned: GitHub's body can name the repo, the token's
    // scopes or why it was rejected.
    console.error(`trigger-workflow: GitHub returned ${dispatchResp.status}`, await dispatchResp.text());
    return json({ error: 'Could not start the workflow. Check the deploy logs.' }, 502);
  }

  return json({ triggered: selected.file }, 200);
};

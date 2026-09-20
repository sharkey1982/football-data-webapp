// ============================================================================
// src/lib/workflowTrigger.ts
//
// Calls the netlify/functions/trigger-workflow proxy, which holds the
// GitHub token server-side and dispatches one of a fixed set of workflows
// (see that function's own comment for why this can't happen directly
// from the browser). A trigger only starts the run -- it doesn't wait
// for or report completion, since a run typically takes 1-2 minutes and
// this app has no existing polling infrastructure for GitHub Actions run
// status. Callers should say so in their own UI rather than implying
// the effect is immediate.
//
// The proxy requires an ADMIN Supabase session (it verifies the token
// server-side and calls is_admin itself -- a client-sent admin flag
// would be worthless). So the access token has to go up with every
// request; without it the call is a 401 and the buttons that use this
// stop working.
// ============================================================================

import { supabase } from './supabase';

export type TriggerableWorkflow = 'simulate-fixture-bonus' | 'simulate-final-table' | 'refresh-fpl-projections';

export async function triggerWorkflow(workflow: TriggerableWorkflow, inputs?: Record<string, string>): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    // Caught before the network call so the message names the real
    // problem: a session that has expired mid-visit looks identical to a
    // server fault once it's a bare 401.
    throw new Error('You need to be signed in as an admin to run this.');
  }

  const resp = await fetch('/.netlify/functions/trigger-workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ workflow, inputs }),
  });
  if (!resp.ok) {
    let message = `Failed to trigger ${workflow} (HTTP ${resp.status})`;
    try {
      const body = (await resp.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // response wasn't JSON -- keep the generic message
    }
    throw new Error(message);
  }
}

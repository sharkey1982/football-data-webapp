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
// ============================================================================

export type TriggerableWorkflow = 'simulate-fixture-bonus' | 'simulate-final-table' | 'refresh-fpl-projections';

export async function triggerWorkflow(workflow: TriggerableWorkflow, inputs?: Record<string, string>): Promise<void> {
  const resp = await fetch('/.netlify/functions/trigger-workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

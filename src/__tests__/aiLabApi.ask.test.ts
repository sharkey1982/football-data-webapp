import { describe, it, expect, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { askQuestion, sourcesUsed } from '../lib/aiLabApi';

describe('Ask FixtureShark API', () => {
  it('sends the question with the current model and prompt, filed under the Ask log', async () => {
    invoke.mockResolvedValue({ data: { run_id: 42 }, error: null });
    await expect(askQuestion('Who is top?', 7)).resolves.toEqual({ run_id: 42 });
    expect(invoke).toHaveBeenCalledWith('ai-lab-run', {
      body: { question: 'Who is top?', model: 'claude-sonnet-5', prompt_id: 'analyst_v2', batch_id: 7 },
    });
  });

  it('omits the batch when the log does not exist', async () => {
    invoke.mockResolvedValue({ data: { run_id: 43 }, error: null });
    await askQuestion('Who is top?', null);
    expect(invoke).toHaveBeenLastCalledWith('ai-lab-run', { body: { question: 'Who is top?', model: 'claude-sonnet-5', prompt_id: 'analyst_v2' } });
  });

  it('lists each data source once, skipping look-ups, the submit step and failed calls', () => {
    const s = sourcesUsed([
      { tool_name: 'find_entity' },
      { tool_name: 'get_fpl_players' },
      { tool_name: 'get_fpl_players' },
      { tool_name: 'get_league_table', error: 'timeout' },
      { tool_name: 'get_fpl_projections' },
      { tool_name: 'submit_answer' },
    ]);
    expect(s.map((x) => [x.tool, x.kind])).toEqual([['get_fpl_players', 'data'], ['get_fpl_projections', 'model']]);
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import AiLabPage from '../pages/admin/AiLabPage';
import * as labApi from '../lib/aiLabApi';

let admin = true;
vi.mock('../lib/auth', () => ({
  useAuthOptional: () => ({ isAdmin: admin, session: admin ? { user: { email: 'admin@example.com' } } : null, loading: false }),
}));

vi.mock('../lib/aiLabApi', async () => {
  const actual = await vi.importActual<typeof labApi>('../lib/aiLabApi');
  return {
    ...actual,
    getBenchmarkQuestions: vi.fn(),
    getPromptVersions: vi.fn(),
    getRecentRuns: vi.fn(),
    getBatches: vi.fn(),
    getRunDetail: vi.fn(),
    getBatchForReview: vi.fn(),
    enqueueBatch: vi.fn(),
    runQuestion: vi.fn(),
    saveReview: vi.fn(),
  };
});
const api = labApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const question = {
  question_id: 'A01', category: 'A. Fixtures and results', question: 'Who do Arsenal play next, and when?', difficulty: 1,
  expected_behaviour: 'answer', must_include: [], must_not_claim: [], answerable_now: true, answerability_note: null,
  experiments: ['exp001'], version: 1,
};

const detail: labApi.RunDetail = {
  run: {
    run_id: 1, batch_id: null, question_id: 'A01', question_version: 1, question: question.question, provider: 'anthropic',
    model: 'claude-sonnet-5', prompt_id: 'analyst_v1', toolset_version: 'ai_tools_v1',
    answer: 'Arsenal play Leeds at home on 10 October at 12:30.', answer_type: 'answered',
    facts_used: [{ value: '2026-10-10', meaning: 'Kick-off date', tool: 'get_fixtures' }],
    stop_reason: 'tool_use', rounds: 2, input_tokens: 486, output_tokens: 466, cache_read_tokens: 3074, cache_write_tokens: 3074,
    cost_usd: '0.01393', latency_ms: 5576, error: null, created_at: '2026-09-26T11:00:00Z',
  },
  steps: [
    { step_no: 1, tool_name: 'get_fixtures', arguments: { team: 'Arsenal', limit: 1 }, result: { rows: [{ home_team: 'Arsenal', away_team: 'Leeds' }] }, latency_ms: 97, error: null },
  ],
  truth: [{ home_team: 'Arsenal', away_team: 'Leeds' }],
  grade: { checks: { completed: { pass: true, detail: 'no error' }, facts_grounded: { pass: false, detail: 'not found' } }, passed: 1, total: 2 },
  review: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  admin = true;
  api.getBenchmarkQuestions.mockResolvedValue([question]);
  api.getPromptVersions.mockResolvedValue([{ prompt_id: 'analyst_v1', notes: null, body: '', created_at: '' }]);
  api.getRecentRuns.mockResolvedValue([]);
  api.getBatches.mockResolvedValue([]);
  api.getRunDetail.mockResolvedValue(detail);
  api.runQuestion.mockResolvedValue({ run_id: 1 });
});

const renderPage = () => render(<MemoryRouter><AiLabPage /></MemoryRouter>);

describe('AiLabPage', () => {
  it('is admin-only and loads nothing for anyone else', () => {
    admin = false;
    renderPage();
    expect(screen.getByText('This page is for admins.')).toBeInTheDocument();
    expect(api.getBenchmarkQuestions).not.toHaveBeenCalled();
  });

  it('runs a benchmark question and shows the trace, answer, checks and truth', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('tab', { name: 'Run' }));
    const select = await screen.findByRole('combobox', { name: /benchmark question/i });
    await waitFor(() => expect(screen.getByRole('option', { name: /A01/ })).toBeInTheDocument());
    await userEvent.selectOptions(select, 'A01');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(api.runQuestion).toHaveBeenCalledWith({ question_id: 'A01', model: 'claude-sonnet-5', prompt_id: 'analyst_v1' });
    expect(await screen.findByText('Arsenal play Leeds at home on 10 October at 12:30.')).toBeInTheDocument();
    expect(screen.getByText('get_fixtures', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Automatic checks: 1 of 2 passed')).toBeInTheDocument();
    expect(screen.getByText('Ground truth at run time')).toBeInTheDocument();
    expect(screen.getByText('$0.0139')).toBeInTheDocument();

    // Ground truth is shown as readable rows, not JSON; tool data only when opened.
    expect(screen.queryAllByText(/"away_team": "Leeds"/, { selector: 'pre' })).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: /Show data/ }));
    expect(screen.getAllByText(/"away_team": "Leeds"/, { selector: 'pre' })).toHaveLength(1);
  });

  it('shows the function error rather than failing silently', async () => {
    api.runQuestion.mockRejectedValue(new Error('Monthly AI Lab limit reached: $20.00 of $20.'));
    renderPage();
    await userEvent.click(await screen.findByRole('tab', { name: 'Run' }));
    await userEvent.type(await screen.findByRole('textbox', { name: /question/i }), 'Who is top?');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Monthly AI Lab limit reached: $20.00 of $20.')).toBeInTheDocument();
  });

  it('reviews a batch one answer at a time: first unreviewed, readable truth, Save & next', async () => {
    const batch = { batch_id: 1, name: 'exp001', model: 'claude-sonnet-5', prompt_id: 'analyst_v1', toolset_version: 'ai_tools_v1',
      question_ids: ['A01', 'A02'], as_of: '2026-09-26T12:25:00Z', status: 'finished', runs: 2, cost: 0.03, checks_passed: 10, checks_total: 12,
      items: { done: 2, failed: 0, waiting: 0 } };
    api.getBatches.mockResolvedValue([batch]);
    const second = { ...detail, run: { ...detail.run, run_id: 2, question_id: 'A02', question: 'What was the score last time?', answer: 'Everton 1-2 Liverpool.' },
      truth: [{ home_team: 'Everton', away_team: 'Liverpool', home_goals: 1, away_goals: 2 }] };
    api.getBatchForReview.mockResolvedValue([
      { ...detail, reviewed: true, review: { factually_correct: 'yes', usefulness: 4, unsupported_claims: null, comment: null, ideal_answer: null } },
      { ...second, reviewed: false },
    ]);
    api.saveReview.mockResolvedValue(undefined);
    renderPage();

    // Opens on the first unreviewed answer.
    expect(await screen.findByText('Everton 1-2 Liverpool.')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 reviewed')).toBeInTheDocument();
    expect(screen.getByText('home goals')).toBeInTheDocument(); // truth as rows, not JSON

    const save = screen.getByRole('button', { name: 'Save & next' });
    expect(save).toBeDisabled(); // needs a correctness verdict first
    await userEvent.click(screen.getByRole('radio', { name: 'No' }));
    await userEvent.click(screen.getByRole('radio', { name: '2' }));
    await userEvent.click(save);
    expect(api.saveReview).toHaveBeenCalledWith(2, expect.objectContaining({ factually_correct: 'no', usefulness: 2 }));
    expect(await screen.findByText('2 of 2 reviewed')).toBeInTheDocument();
  });
});

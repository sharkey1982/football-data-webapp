import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import AskFixtureSharkPage from '../pages/admin/AskFixtureSharkPage';
import * as labApi from '../lib/aiLabApi';

let admin = true;
vi.mock('../lib/auth', () => ({
  useAuthOptional: () => ({ isAdmin: admin, session: admin ? { user: { email: 'admin@example.com' } } : null, loading: false }),
}));

vi.mock('../lib/aiLabApi', async () => {
  const actual = await vi.importActual<typeof labApi>('../lib/aiLabApi');
  return {
    ...actual,
    getAskBatchId: vi.fn(),
    getBatchForReview: vi.fn(),
    getRunDetail: vi.fn(),
    askQuestion: vi.fn(),
    saveReview: vi.fn(),
    getCreditSummary: vi.fn(),
    saveCreditCheck: vi.fn(),
  };
});
const api = labApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const item = (run_id: number, question: string, answer: string, extra: Partial<labApi.AiRun> = {}): labApi.ReviewItem => ({
  run: {
    run_id, batch_id: 7, question_id: null, question_version: null, question, provider: 'anthropic',
    model: 'claude-sonnet-5', prompt_id: 'analyst_v2', toolset_version: 'ai_tools_v2', answer, answer_type: 'answered',
    facts_used: [{ value: '1.82', meaning: 'Average FDR', tool: 'compare_fixture_runs' }],
    stop_reason: 'tool_use', rounds: 3, input_tokens: 900, output_tokens: 700, cache_read_tokens: 4000, cache_write_tokens: 0,
    cost_usd: '0.0241', latency_ms: 21000, error: null, created_at: '2026-10-11T19:00:00Z', ...extra,
  },
  steps: [
    { step_no: 1, tool_name: 'find_entity', arguments: { name: 'Arsenal' }, result: {}, latency_ms: 40, error: null },
    { step_no: 2, tool_name: 'compare_fixture_runs', arguments: { from_gw: 8, to_gw: 12 }, result: { leaders: {} }, latency_ms: 90, error: null },
    { step_no: 3, tool_name: 'submit_answer', arguments: {}, result: null, latency_ms: 0, error: null },
  ],
  truth: null,
  grade: null,
  review: null,
  reviewed: false,
});

const old = item(10, 'Who has the easiest run?', 'Arsenal, average FDR 1.82.');

beforeEach(() => {
  vi.clearAllMocks();
  admin = true;
  api.getCreditSummary.mockResolvedValue({ month_site_usd: 0.53, month_external_usd: 1.75, monthly_limit_usd: 20, last_check: null });
  api.getAskBatchId.mockResolvedValue(7);
  api.getBatchForReview.mockResolvedValue([old]);
  api.saveReview.mockResolvedValue(undefined);
});

const renderPage = () => render(<MemoryRouter><AskFixtureSharkPage /></MemoryRouter>);

describe('AskFixtureSharkPage', () => {
  it('is admin-only and makes no requests for anyone else', () => {
    admin = false;
    renderPage();
    expect(screen.getByText('This page is for admins.')).toBeInTheDocument();
    expect(api.getAskBatchId).not.toHaveBeenCalled();
  });

  it('asks, files it under the Ask log, and shows the answer with sources', async () => {
    const fresh = item(11, 'Best pair of midfielders for £15m?', 'Saka and Mbeumo, 11.4 projected points.', {
      answer_type: 'partial',
    });
    fresh.steps = [{ step_no: 1, tool_name: 'best_fpl_combination', arguments: { budget: 15 }, result: {}, latency_ms: 80, error: null }];
    api.askQuestion.mockResolvedValue({ run_id: 11 });
    renderPage();
    expect(await screen.findByText('Who has the easiest run?')).toBeInTheDocument();

    api.getBatchForReview.mockResolvedValue([fresh, old]);
    await userEvent.type(screen.getByRole('textbox', { name: 'Question' }), 'Best pair of midfielders for £15m?');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(api.askQuestion).toHaveBeenCalledWith('Best pair of midfielders for £15m?', 7);
    expect(await screen.findByText('Saka and Mbeumo, 11.4 projected points.')).toBeInTheDocument();
    expect(screen.getByText(/AI answer from FixtureShark data/)).toBeInTheDocument();
    expect(screen.getByText(/Partly answered/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /best combination search/ });
    expect(link).toHaveAttribute('href', '/fpl');
    expect(screen.getByText('2 asked · 0 marked · $0.0482 in total')).toBeInTheDocument();
  });

  it('opens a past question, lists its sources without plumbing, and saves a mark', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Who has the easiest run\?/ }));
    expect(screen.getByText('Arsenal, average FDR 1.82.')).toBeInTheDocument();
    const sources = screen.getByText('Sources').parentElement!;
    expect(within(sources).getAllByRole('listitem')).toHaveLength(1); // find_entity and submit_answer are not sources
    expect(within(sources).getByRole('link')).toHaveAttribute('href', '/fixtures');

    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    await userEvent.click(screen.getByRole('radio', { name: '4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save review' }));
    expect(api.saveReview).toHaveBeenCalledWith(10, expect.objectContaining({ factually_correct: 'yes', usefulness: 4 }));
    expect(await screen.findByText(/1 marked/)).toBeInTheDocument();
  });

  it('shows the function error, such as the monthly limit', async () => {
    api.askQuestion.mockRejectedValue(new Error('Monthly AI Lab limit reached: $20.00 of $20.'));
    renderPage();
    await userEvent.type(await screen.findByRole('textbox', { name: 'Question' }), 'Who is top?');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Monthly AI Lab limit reached: $20.00 of $20.')).toBeInTheDocument();
  });
});

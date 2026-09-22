import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import DataFlow from '../pages/DataFlow';
import * as flowApi from '../lib/metaFlowApi';

// Admin-only page: without an admin session it renders the "for admins" note
// instead of the table, so the session is mocked here.
vi.mock('../lib/auth', () => ({
  useAuthOptional: () => ({ isAdmin: true, session: { user: { email: 'admin@example.com' } }, loading: false }),
}));

vi.mock('../lib/metaFlowApi', async () => {
  const actual = await vi.importActual<typeof flowApi>('../lib/metaFlowApi');
  return {
    ...actual,
    getFlowNodes: vi.fn(),
    getFlowHistory: vi.fn(),
    getRecentFlowChanges: vi.fn(),
    saveFlowNotes: vi.fn(),
    refreshFlow: vi.fn(),
  };
});
const api = flowApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const node = (over: Partial<flowApi.FlowNode> = {}): flowApi.FlowNode => ({
  node_key: 'object:fixtures',
  kind: 'table',
  obj_name: 'fixtures',
  layer: 'source',
  purpose: 'Upcoming and played fixtures.',
  refresh_note: 'Nightly',
  commentary: null,
  row_estimate: 1807,
  feeds_from: 0,
  feeds_into: 39,
  reads_from: null,
  first_seen: '2026-09-22T10:00:00Z',
  last_seen: '2026-09-22T10:00:00Z',
  is_present: true,
  last_definition_change: null,
  definition_changes: 0,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getFlowNodes.mockResolvedValue([
    node(),
    node({ node_key: 'function:get_daily_digest(p_season_id bigint)', kind: 'function', obj_name: 'get_daily_digest', layer: 'api', purpose: null, feeds_from: 3, feeds_into: 0, reads_from: 'fixtures, matches, teams' }),
  ]);
  api.getRecentFlowChanges.mockResolvedValue([
    { history_id: 2, node_key: 'object:fixtures', changed_at: '2026-09-22T10:00:00Z', change: 'definition changed', detail: 'definition fingerprint moved', author: 'automatic' },
  ]);
  api.getFlowHistory.mockResolvedValue([
    { history_id: 1, node_key: 'object:fixtures', changed_at: '2026-09-22T09:00:00Z', change: 'added', detail: 'table first seen', author: 'automatic' },
  ]);
  api.saveFlowNotes.mockResolvedValue(undefined);
  api.refreshFlow.mockResolvedValue({ nodes: 211, edges: 334, changes: 0 });
});

// "fixtures" appears in both the table and the "Changed lately" list, so
// queries are scoped to the table of objects.
const table = () => within(screen.getByRole('table'));

function renderPage() {
  return render(
    <MemoryRouter>
      <DataFlow />
    </MemoryRouter>,
  );
}

describe('Data flow page', () => {
  it('lists every object with its layer and how much it feeds', async () => {
    renderPage();
    await screen.findByRole('table');
    expect(table().getByText('fixtures')).toBeInTheDocument();
    expect(table().getByText('get_daily_digest')).toBeInTheDocument();
    expect(table().getByText('0 in / 39 out')).toBeInTheDocument();
    expect(table().getByText('3 in / 0 out')).toBeInTheDocument();
  });

  it('shows what changed lately, so a surprise is visible without hunting', async () => {
    renderPage();
    await screen.findByRole('table');
    expect(screen.getByText('Changed lately')).toBeInTheDocument();
    expect(screen.getByText('definition changed')).toBeInTheDocument();
  });

  it('filters by layer', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table');
    await user.selectOptions(screen.getByLabelText('Layer'), 'api');
    expect(table().queryByText('fixtures')).not.toBeInTheDocument();
    expect(table().getByText('get_daily_digest')).toBeInTheDocument();
  });

  it('searches by name or purpose', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table');
    await user.type(screen.getByLabelText('Search'), 'digest');
    expect(table().queryByText('fixtures')).not.toBeInTheDocument();
    expect(table().getByText('get_daily_digest')).toBeInTheDocument();
  });

  it('opens an object to show its lineage and history', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table');
    await user.click(table().getByText('get_daily_digest'));
    expect(await screen.findByText(/fixtures, matches, teams/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('added')).toBeInTheDocument());
  });

  it('saves notes, which the database records in the history itself', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table');
    await user.click(table().getByText('fixtures'));
    const commentary = await screen.findByLabelText('Commentary');
    await user.type(commentary, 'Checked after the nightly run.');
    await user.click(screen.getByRole('button', { name: 'Save notes' }));
    await waitFor(() =>
      expect(api.saveFlowNotes).toHaveBeenCalledWith('object:fixtures', expect.objectContaining({ commentary: 'Checked after the nightly run.' })),
    );
  });

  it('can re-derive the flow on demand and says whether anything moved', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Refresh now' }));
    await waitFor(() => expect(api.refreshFlow).toHaveBeenCalled());
    expect(await screen.findByText('Refreshed: nothing had changed.')).toBeInTheDocument();
  });
});

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SourceData from '../pages/SourceData';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  return {
    getLeagues: vi.fn(),
    getRawMatchFiles: vi.fn(),
    getSourceMatchRows: vi.fn(),
  };
});

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const FILE_E0 = {
  raw_file_id: 1,
  source_name: 'football-data.co.uk',
  source_url: 'https://football-data.co.uk/mmz4281/2526/E0.csv',
  source_code: 'E0',
  competition_code: 'E0',
  season_label: '2526',
  retrieved_at: '2026-09-11T03:03:53.339327+00:00',
  content_hash: 'abc',
  row_count: 2,
  column_names: ['Div', 'Date', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG', 'B365H'],
  file_metadata: {},
};

const FILE_E1 = {
  ...FILE_E0,
  raw_file_id: 2,
  competition_code: 'E1',
  source_code: 'E1',
  season_label: '2425',
  // A different season/provider can have entirely different columns.
  column_names: ['Div', 'Date', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG', 'WHH'],
};

describe('SourceData page', () => {
  it('derives season/competition filters from the files themselves, then shows a selected file\'s own dynamic columns', async () => {
    mockedApi.getLeagues.mockResolvedValue([{ league_id: 1, code: 'E0', name: 'Premier League' }]);
    mockedApi.getRawMatchFiles.mockResolvedValue([FILE_E0, FILE_E1]);
    mockedApi.getSourceMatchRows.mockResolvedValue([
      {
        source_match_row_id: 1, source_competition_id: null, raw_file_id: 1, source_row_key: 'k1',
        source_home_team: 'Arsenal', source_away_team: 'Chelsea', source_match_date: '2025-08-16',
        source_kickoff_time: null, source_row_number: null, raw_hash: 'h1',
        first_seen_at: '', last_seen_at: '',
        raw_data: { Div: 'E0', Date: '16/08/2025', HomeTeam: 'Arsenal', AwayTeam: 'Chelsea', FTHG: '2', FTAG: '0', B365H: '1.9' },
      },
      {
        source_match_row_id: 2, source_competition_id: null, raw_file_id: 1, source_row_key: 'k2',
        source_home_team: 'Fulham', source_away_team: 'Everton', source_match_date: '2025-08-17',
        source_kickoff_time: null, source_row_number: null, raw_hash: 'h2',
        first_seen_at: '', last_seen_at: '',
        raw_data: { Div: 'E0', Date: '17/08/2025', HomeTeam: 'Fulham', AwayTeam: 'Everton', FTHG: '1', FTAG: '1', B365H: '2.5' },
      },
    ]);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SourceData />
      </MemoryRouter>
    );

    // Season/Competition options come from the files, not a hardcoded
    // list. Wait on something that doesn't depend on the leagues lookup
    // (which is a separate, best-effort async call for friendly names).
    await screen.findAllByText('View \u2192');
    const seasonSelect = screen.getByLabelText('Season');
    expect(within(seasonSelect).getByRole('option', { name: '2526' })).toBeInTheDocument();
    expect(within(seasonSelect).getByRole('option', { name: '2425' })).toBeInTheDocument();

    // Select the E0 file.
    await user.click((await screen.findAllByText('View \u2192'))[0]);
    expect(mockedApi.getSourceMatchRows).toHaveBeenCalledWith(1);

    // Columns rendered come from THIS file's column_names, not a fixed schema.
    await screen.findByText('Arsenal');
    expect(screen.getByText('B365H')).toBeInTheDocument();
    expect(screen.queryByText('WHH')).not.toBeInTheDocument();

    // Column filter narrows the visible columns dynamically.
    await user.type(screen.getByLabelText('Filter columns'), 'FTHG');
    expect(screen.queryByText('B365H')).not.toBeInTheDocument();
    expect(screen.getByText('FTHG')).toBeInTheDocument();
  });

  it('shows columns actually present in row data even when they are missing from the file\'s declared column_names', async () => {
    // Real-world case found in the live data: a web-scraped cup fixture
    // file whose rows contain keys (e.g. an unexpected fallback field)
    // that aren't in the file's own column_names metadata. The page must
    // not silently hide that data.
    const fileWithDrift = {
      raw_file_id: 9,
      source_name: 'footballwebpages.co.uk',
      source_url: 'https://example.com/cup.html',
      source_code: 'LC',
      competition_code: 'LC',
      season_label: '252026',
      retrieved_at: '2026-09-11T03:03:53.339327+00:00',
      content_hash: 'xyz',
      row_count: 1,
      column_names: ['date', 'round', 'raw_text'],
      file_metadata: {},
    };
    mockedApi.getLeagues.mockResolvedValue([]);
    mockedApi.getRawMatchFiles.mockResolvedValue([fileWithDrift]);
    mockedApi.getSourceMatchRows.mockResolvedValue([
      {
        source_match_row_id: 99, source_competition_id: null, raw_file_id: 9, source_row_key: 'k',
        source_home_team: null, source_away_team: null, source_match_date: null,
        source_kickoff_time: null, source_row_number: null, raw_hash: 'h',
        first_seen_at: '', last_seen_at: '',
        // Note: 'source_html' is NOT in column_names above.
        raw_data: { round: 'First Round', source_html: '<html>a very long page dump...</html>' },
      },
    ]);

    render(
      <MemoryRouter>
        <SourceData />
      </MemoryRouter>
    );

    const user = userEvent.setup();
    await user.click((await screen.findAllByText('View \u2192'))[0]);
    await screen.findByText('source_html');
    expect(screen.getByText('round')).toBeInTheDocument();
    // A declared column that no row actually has is fine to still list,
    // but the mismatch itself should be visible to the person.
    expect(screen.getByText(/declared, actual rows differ/)).toBeInTheDocument();
  });
});

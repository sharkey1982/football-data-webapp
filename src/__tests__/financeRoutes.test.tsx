import React from 'react';
import * as authLib from '../lib/auth';
import * as financeApi from '../lib/financeApi';

vi.mock('../lib/auth', async () => {
  const actual = await vi.importActual<typeof authLib>('../lib/auth');
  return { ...actual, useAuthOptional: vi.fn(() => null) };
});
vi.mock('../lib/financeApi', async () => {
  const actual = await vi.importActual<typeof financeApi>('../lib/financeApi');
  return { ...actual, getClubFinanceBySlug: vi.fn(), getFinanceIndex: vi.fn(), getAllClubFinance: vi.fn(), teamHasFinance: vi.fn().mockResolvedValue(false) };
});
const mocked = financeApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import App from '../App';
import { buildFinanceIndex } from '../lib/financeApi';
import { southendData } from './fixtures/southendFinance';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

/* The real App, at a real URL: tests the route table as it exists, not a
   copy of it. */
function visit(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

describe('finance routes, through the real App', () => {
  it('/football/teams/:slug/finances renders the club finance page for that slug', async () => {
    mocked.getClubFinanceBySlug.mockResolvedValue(southendData());
    visit('/football/teams/southend/finances');
    expect(await screen.findByRole('heading', { level: 1, name: 'Southend finances' })).toBeInTheDocument();
    expect(mocked.getClubFinanceBySlug).toHaveBeenCalledWith('southend');
  });

  it('/finance renders the index of clubs with published accounts', async () => {
    mocked.getFinanceIndex.mockResolvedValue(buildFinanceIndex([southendData()]));
    visit('/finance');
    expect(await screen.findByRole('heading', { level: 1, name: 'Club finances' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Southend/ })).toHaveAttribute('href', '/football/teams/southend/finances');
  });

  it('/finance/compare renders the club comparison', async () => {
    mocked.getAllClubFinance.mockResolvedValue([southendData()]);
    visit('/finance/compare');
    expect(await screen.findByRole('heading', { level: 1, name: 'Club finances compared' })).toBeInTheDocument();
    expect(mocked.getAllClubFinance).toHaveBeenCalled();
  });

  it('/football/finance is NOT the finance page (it belongs to the journey routes)', async () => {
    visit('/football/finance');
    await new Promise((r) => setTimeout(r, 50));
    expect(mocked.getFinanceIndex).not.toHaveBeenCalled();
    expect(mocked.getClubFinanceBySlug).not.toHaveBeenCalled();
  });
});

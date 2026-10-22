// Audit 22 Oct 2026: S-10 (every page gets a head after client-side
// navigation), S-05 (not-found branches are noindex), S-17 (llms.txt).
import React from 'react';
import * as authLib from '../lib/auth';

vi.mock('../lib/auth', async () => {
  const actual = await vi.importActual<typeof authLib>('../lib/auth');
  return { ...actual, useAuthOptional: vi.fn(() => ({ isAdmin: false })) };
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { useDocumentHead } from '../hooks/useDocumentHead';
import StagePage from '../pages/StagePage';
import { BRAND_NAME } from '../lib/siteConfig';

function WithHead() {
  useDocumentHead({ title: 'Arsenal — ratings & fixtures', description: 'Arsenal page', path: '/football/teams/arsenal' });
  return (
    <div>
      <Link to="/table">to table</Link> <Link to="/no/such/page">to unknown</Link> <Link to="/other-with-head">to other</Link>
    </div>
  );
}
function OtherWithHead() {
  useDocumentHead({ title: 'Other page', path: '/other-with-head' });
  return <p>other</p>;
}
function NoHead() {
  return <Link to="/football/teams/arsenal">back</Link>;
}

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route path="football/teams/arsenal" element={<WithHead />} />
          <Route path="other-with-head" element={<OtherWithHead />} />
          <Route path="football/:stage" element={<StagePage themeKey="football" />} />
          <Route path="*" element={<NoHead />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const canonical = () => document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
const description = () => document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null;

afterEach(() => {
  cleanup();
  document.querySelectorAll('link[rel="canonical"], meta[name="description"], meta[name="robots"]').forEach((el) => el.remove());
  document.title = '';
});

describe('head fallback from routeMeta (S-10)', () => {
  it('a page without its own head gets its routeMeta head, not the previous page’s', async () => {
    renderApp('/football/teams/arsenal');
    expect(document.title).toContain('Arsenal');
    await userEvent.setup().click(screen.getByRole('link', { name: 'to table' }));
    expect(document.title).toBe(`League tables | ${BRAND_NAME}`);
    expect(canonical()).toMatch(/\/table$/);
    expect(description()).toMatch(/^Standings computed from results/);
  });

  it('an unknown path without a head gets the site defaults and no canonical', async () => {
    renderApp('/football/teams/arsenal');
    await userEvent.setup().click(screen.getByRole('link', { name: 'to unknown' }));
    expect(document.title).toBe(BRAND_NAME);
    expect(canonical()).toBeNull();
  });

  it('a page that sets its own head keeps it', async () => {
    renderApp('/football/teams/arsenal');
    await userEvent.setup().click(screen.getByRole('link', { name: 'to other' }));
    expect(document.title).toBe(`Other page | ${BRAND_NAME}`);
    expect(canonical()).toMatch(/\/other-with-head$/);
  });

  it('leaves the served head alone on the first render', () => {
    document.title = 'Served title';
    renderApp('/some/prerendered/page');
    expect(document.title).toBe('Served title');
  });
});

describe('not-found branches are noindex (S-05)', () => {
  it('an unknown section under a hub renders the not-found page with noindex', () => {
    renderApp('/football/not-a-section');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Football' })).toHaveAttribute('href', '/football');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
  });
});

describe('llms.txt (S-17)', () => {
  it('points Player projections at /fpl/player-points and names /fpl as Match projections', async () => {
    const { readFileSync } = await import('node:fs');
    const txt = readFileSync(`${process.cwd()}/public/llms.txt`, 'utf8');
    expect(txt).toContain('[Player projections](https://fixtureshark.com/fpl/player-points)');
    expect(txt).toContain('[Match projections](https://fixtureshark.com/fpl)');
  });
});

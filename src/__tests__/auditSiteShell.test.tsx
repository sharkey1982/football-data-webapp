// Audit 22 Oct 2026: S-04 (menu links always in the DOM, footer hub links),
// S-07 (static cookie banner wired by React), S-12 (skip link, Escape),
// S-17 (breadcrumb names).
import React from 'react';
import * as authLib from '../lib/auth';
import * as analytics from '../lib/analytics';

vi.mock('../lib/auth', async () => {
  const actual = await vi.importActual<typeof authLib>('../lib/auth');
  return { ...actual, useAuthOptional: vi.fn(() => ({ isAdmin: false })) };
});
vi.mock('../lib/analytics', async () => {
  const actual = await vi.importActual<typeof analytics>('../lib/analytics');
  return {
    ...actual,
    analyticsAvailable: vi.fn(() => true),
    initAnalytics: vi.fn(),
    grantConsent: vi.fn(),
    denyConsent: vi.fn(),
    getStoredConsent: vi.fn(() => null),
    trackPageView: vi.fn(),
  };
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { CookieConsent, STATIC_BANNER_ID } from '../components/CookieConsent';
import { breadcrumbName } from '../lib/routeMeta';

const mocked = analytics as unknown as Record<string, ReturnType<typeof vi.fn>>;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route path="*" element={<p>page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  document.getElementById(STATIC_BANNER_ID)?.remove();
});

describe('header menu (S-04, S-12)', () => {
  it('keeps every menu link in the DOM while closed, hidden from the accessibility tree', () => {
    const { container } = renderAt('/table');
    const button = screen.getByRole('button', { name: /^FPL/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const menu = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(menu).toHaveAttribute('hidden');
    expect(container.querySelector('a[href="/fpl/player-points"]')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Player Projections' })).not.toBeInTheDocument();
  });

  it('opens on click and closes on Escape, returning focus to its button', async () => {
    renderAt('/table');
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: /^FPL/ });
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Player Projections' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('has a skip link to the main content, first in the page', () => {
    renderAt('/table');
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', '#main-content');
    expect(document.getElementById('main-content')?.tagName).toBe('MAIN');
  });

  it('links the five section hubs in the footer', () => {
    renderAt('/table');
    const footer = screen.getByRole('navigation', { name: 'Sections' });
    const hrefs = [...footer.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/football', '/fpl/start', '/nfl', '/tennis', '/international']);
  });
});

describe('cookie banner (S-07)', () => {
  function staticBanner(hidden: boolean) {
    const el = document.createElement('section');
    el.id = STATIC_BANNER_ID;
    el.hidden = hidden;
    el.innerHTML = '<p>cookies</p><button type="button" data-consent="denied">Decline</button><button type="button" data-consent="granted">Accept</button>';
    document.body.appendChild(el);
    return el;
  }

  it('wires the static banner: Accept grants consent and hides it, and React renders no second banner', () => {
    const el = staticBanner(false);
    render(<CookieConsent />);
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(1);
    expect(el.hidden).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(mocked.grantConsent).toHaveBeenCalled();
    expect(el.hidden).toBe(true);
  });

  it('hides the static banner where analytics cannot run, and loads nothing', () => {
    mocked.analyticsAvailable.mockReturnValueOnce(false);
    mocked.grantConsent.mockClear();
    const el = staticBanner(false);
    render(<CookieConsent />);
    expect(el.hidden).toBe(true);
    expect(mocked.grantConsent).not.toHaveBeenCalled();
  });

  it('hides it for a visitor who already chose', () => {
    mocked.getStoredConsent.mockReturnValueOnce('denied');
    const el = staticBanner(false);
    render(<CookieConsent />);
    expect(el.hidden).toBe(true);
  });

  it('falls back to rendering the banner itself without the static one', () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(mocked.denyConsent).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
  });
});

describe('breadcrumb names (S-17)', () => {
  it('cuts a title at an em dash or a colon', () => {
    expect(breadcrumbName('Football records: most points, longest runs, biggest wins')).toBe('Football records');
    expect(breadcrumbName('Fantasy Premier League \u2014 projections and tools')).toBe('Fantasy Premier League');
    expect(breadcrumbName('League Table')).toBe('League Table');
  });
});

describe('static cookie banner in index.html (S-07)', () => {
  it('uses the same storage keys as the analytics module', async () => {
    const { readFileSync } = await import('node:fs');
    const html = readFileSync(`${process.cwd()}/index.html`, 'utf8');
    expect(html).toContain(`id="${STATIC_BANNER_ID}"`);
    expect(html).toContain(`'${analytics.CONSENT_STORAGE_KEY}'`);
    expect(html).toContain(`'${analytics.ADMIN_DEVICE_KEY}'`);
    expect(html).toMatch(/data-consent="granted"/);
    expect(html).toMatch(/data-consent="denied"/);
  });
});

describe('prerendered hub bodies (S-04)', () => {
  it('home and the five hubs render a body with the menu and footer links', async () => {
    const { renderStaticRouteHead } = await import('../entry-server');
    const { STATIC_ROUTES } = await import('../lib/routeMeta');
    for (const path of ['/', '/football', '/fpl/start', '/nfl', '/tennis', '/international']) {
      const meta = STATIC_ROUTES.find((m) => m.path === path)!;
      const { html } = renderStaticRouteHead(meta);
      expect(html, path).toContain('<main');
      expect(html, path).toContain('href="/fpl/player-points"');
      expect(html, path).toContain('href="/international"');
    }
  });

  it('other static routes stay head-only', async () => {
    const { renderStaticRouteHead } = await import('../entry-server');
    const { STATIC_ROUTES } = await import('../lib/routeMeta');
    const meta = STATIC_ROUTES.find((m) => m.path === '/table')!;
    expect(renderStaticRouteHead(meta).html).toBe('');
  });
});

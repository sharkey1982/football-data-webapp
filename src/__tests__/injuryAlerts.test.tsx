// Injury alerts (22 Nov 2026): the alert email builder, the alerts-first
// sign-up form (including Rate My Team's "watch these 15"), the manage
// page's alerts switch and the /email page.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderToString } from 'react-dom/server';
import { alertLine, alertSubject, buildAlertEmail, type AlertChange } from '../../supabase/functions/email-weekly/build.ts';
import EmailSignup from '../components/EmailSignup';
import EmailLandingPage from '../pages/email/EmailLandingPage';
import { EmailManagePage } from '../pages/email/EmailPages';

vi.mock('../lib/myHomeApi', () => ({ getMyClubOptions: vi.fn(async () => []) }));

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const reply = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const sent = (i = 0) => JSON.parse(fetchMock.mock.calls[i][1].body as string);

const raya: AlertChange = {
  id: 1, name: 'Raya', team: 'ARS', slug: 'david-raya', pos: 'GKP', price: 6.3, own: 47.5,
  old_status: 'a', new_status: 'd', old_chance: null, new_chance: 75, old_news: '', new_news: 'Shoulder injury - 75% chance of playing',
  seen_at: '2026-11-21T19:05:00Z', source: 'team',
};

describe('alert email', () => {
  it('says what changed in FPL’s words, with the subject leading on the flag', () => {
    expect(alertLine(raya)).toBe('now: Shoulder injury - 75% chance of playing');
    expect(alertSubject([raya])).toBe('FPL flag: Raya 75%');
    const worse = { ...raya, old_status: 'd', old_chance: 75, new_chance: 25, old_news: 'Shoulder injury - 75% chance of playing', new_news: 'Shoulder injury - 25% chance of playing' };
    expect(alertLine(worse)).toBe('now: Shoulder injury - 25% chance of playing (was: Shoulder injury - 75% chance of playing)');
    const back = { ...raya, old_status: 'd', new_status: 'a', old_news: 'Shoulder injury - 75% chance of playing', new_news: '', new_chance: null };
    expect(alertLine(back)).toBe('back to available (was: Shoulder injury - 75% chance of playing)');
    expect(alertSubject([back])).toBe('FPL: Raya is back to available');
    const out = { ...raya, id: 2, name: 'Saka', new_status: 'i', new_chance: 0, new_news: 'Hamstring injury - Expected back 13 Dec', source: 'watchlist' as const };
    expect(alertSubject([out, raya])).toBe('FPL flag: Saka injured and 1 more');
  });

  it('links the player, says why you got it, and has one-click unsubscribe', () => {
    const m = buildAlertEmail([raya], { token: 'tok' });
    expect(m.html).toContain('https://fixtureshark.com/fpl/players/david-raya');
    expect(m.text).toContain('Raya (ARS) (GKP, £6.3m, 47.5% owned): now: Shoulder injury - 75% chance of playing · in your team');
    expect(m.text).toContain('https://fixtureshark.com/email/manage?t=tok');
    expect(m.headers['List-Unsubscribe']).toContain('email-list?a=one-click&t=tok');
    expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(m.html).not.toMatch(/undefined|null|NaN/);
  });
});

describe('alerts-first sign-up', () => {
  it('leads with injury alerts and posts alerts=1 without JavaScript', () => {
    const html = renderToString(<MemoryRouter><EmailSignup /></MemoryRouter>);
    expect(html).toContain('Injury alerts for your FPL team');
    expect(html).toMatch(/name="alerts" value="1"/);
    expect(html).toContain('href="/email"');
  });

  it('sends alerts: true with the sign-up', async () => {
    fetchMock.mockReturnValueOnce(reply({ ok: true, state: 'check' }));
    render(<MemoryRouter><EmailSignup /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText('Email address'), 'me@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    await screen.findByTestId('email-signup-status');
    expect(sent()).toMatchObject({ action: 'subscribe', alerts: true, email: 'me@example.com' });
  });

  it('Rate My Team: watch these 15, with the FPL ID already known', async () => {
    fetchMock.mockReturnValueOnce(reply({ ok: true, state: 'check' }));
    render(<MemoryRouter><EmailSignup variant="team" fplId={1234567} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Watch these 15 players for me' })).toBeInTheDocument();
    expect(screen.queryByLabelText('FPL team ID')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Email address'), 'me@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Watch my team' }));
    await screen.findByTestId('email-signup-status');
    expect(sent()).toMatchObject({ alerts: true, fpl_id: 1234567 });
  });
});

describe('manage page', () => {
  it('turns alerts off, and warns when there is nothing to alert about', async () => {
    fetchMock.mockReturnValueOnce(reply({ state: 'ok', football: false, alerts: true, fpl_id: null, club: null, watchlist: [] }));
    fetchMock.mockReturnValueOnce(reply({ state: 'ok', football: false, alerts: false, fpl_id: null, club: null, watchlist: [] }));
    render(<MemoryRouter initialEntries={[`/email/manage?t=${'m'.repeat(48)}`]}><Routes><Route path="/email/manage" element={<EmailManagePage />} /></Routes></MemoryRouter>);
    const box = await screen.findByLabelText(/Injury alerts: email me within 15 minutes/);
    expect(box).toBeChecked();
    expect(screen.getByText(/nothing to alert you about/)).toBeInTheDocument();
    await userEvent.click(box);
    expect(sent(1)).toMatchObject({ action: 'manage', changes: { alerts: false } });
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
  });
});

describe('/email page', () => {
  it('shows the sign-up, a real sample alert and the weekly contents', () => {
    render(<MemoryRouter><EmailLandingPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Injury alerts for your FPL team');
    expect(screen.getByTestId('email-signup')).toBeInTheDocument();
    expect(screen.getByTestId('sample-alert')).toHaveTextContent('Shoulder injury - 75% chance of playing');
    expect(screen.getByRole('heading', { name: 'The weekly email' })).toBeInTheDocument();
  });

  it('is prerendered with its body and listed as a static route', async () => {
    const { renderStaticRouteHead } = await import('../entry-server');
    const { STATIC_ROUTES } = await import('../lib/routeMeta');
    const meta = STATIC_ROUTES.find((m) => m.path === '/email')!;
    expect(meta).toBeTruthy();
    const page = renderStaticRouteHead(meta);
    expect(page.html).toContain('What an alert looks like');
    expect(page.canonical).toMatch(/\/email$/);
  });
});

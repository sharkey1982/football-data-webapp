// FPL weekly email: the sign-up form's states (and its no-JavaScript form),
// the confirm / unsubscribe pages, and the privacy page.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderToString } from 'react-dom/server';
import EmailSignup from '../components/EmailSignup';
import { EmailConfirmPage, EmailUnsubscribePage } from '../pages/email/EmailPages';
import PrivacyPage from '../pages/PrivacyPage';
import { EMAIL_LIST_URL, parseFplId } from '../lib/emailApi';

vi.mock('../lib/myHomeApi', () => ({
  getMyClubOptions: vi.fn(async () => [{ teamId: 1, name: 'Arsenal', slug: 'arsenal', leagueId: 1, league: 'Premier League' }]),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

function renderSignup() {
  return render(<MemoryRouter><EmailSignup /></MemoryRouter>);
}

describe('sign-up form', () => {
  it('is a real form that posts to the email-list function without JavaScript', () => {
    const html = renderToString(<MemoryRouter><EmailSignup /></MemoryRouter>);
    expect(html).toContain(`action="${EMAIL_LIST_URL}"`);
    expect(html).toContain('method="post"');
    expect(html).toMatch(/name="email"/);
    expect(html).toMatch(/name="football"/);
    expect(html).toMatch(/name="fpl_id"/);
    expect(html).toMatch(/name="club_id"/);
    expect(html).toMatch(/name="website"/); // honeypot
    expect(html).toContain('href="/privacy"');
  });

  it('shows "check your email" after signing up, and sends the choices', async () => {
    fetchMock.mockReturnValueOnce(reply({ ok: true, state: 'check' }));
    renderSignup();
    await userEvent.type(screen.getByLabelText('Email address'), 'me@example.com');
    await userEvent.click(screen.getByLabelText(/where our model and the betting market disagree/));
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByTestId('email-signup-status')).toHaveTextContent('Check your email');
    expect(sent()).toMatchObject({ action: 'subscribe', email: 'me@example.com', football: true, website: '', fpl_id: null, club_id: null });
  });

  it('prefills the FPL ID and club from My FixtureShark', async () => {
    localStorage.setItem('fixtureshark.fplId', '1234567');
    localStorage.setItem('fixtureshark.myPrefs', JSON.stringify({ club: { teamId: 1, name: 'Arsenal', slug: 'arsenal' }, followed: [] }));
    fetchMock.mockReturnValueOnce(reply({ ok: true, state: 'check' }));
    renderSignup();
    expect(await screen.findByLabelText('FPL team ID')).toHaveValue('1234567');
    await waitFor(() => expect(screen.getByLabelText('Your club')).toHaveValue('1'));
    await userEvent.type(screen.getByLabelText('Email address'), 'me@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    await screen.findByTestId('email-signup-status');
    expect(sent()).toMatchObject({ fpl_id: 1234567, club_id: 1, football: false });
  });

  it('says when the address looks wrong, and when something failed', async () => {
    fetchMock.mockReturnValueOnce(reply({ ok: false, state: 'invalid' }));
    renderSignup();
    await userEvent.type(screen.getByLabelText('Email address'), 'me@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('doesn’t look right');

    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    await userEvent.type(screen.getByLabelText('Email address'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('accepts only real FPL IDs', () => {
    expect(parseFplId('1234567')).toBe(1234567);
    expect(parseFplId(' 42 ')).toBe(42);
    expect(parseFplId('0')).toBeNull();
    expect(parseFplId('123456789')).toBeNull();
    expect(parseFplId('12a')).toBeNull();
  });
});

describe('confirm and unsubscribe pages', () => {
  const at = (path: string, el: React.ReactElement, route: string) =>
    render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /></Routes></MemoryRouter>);

  it('the no-JavaScript landing says check your email', () => {
    at('/email/confirm?state=check', <EmailConfirmPage />, '/email/confirm');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Check your email');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('confirms, then says already signed up', async () => {
    fetchMock.mockReturnValueOnce(reply({ state: 'confirmed', manage: 'b'.repeat(48) }));
    at(`/email/confirm?t=${'c'.repeat(48)}`, <EmailConfirmPage />, '/email/confirm');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('You’re signed up');
    expect(screen.getByRole('link', { name: 'Change what you get' })).toHaveAttribute('href', `/email/manage?t=${'b'.repeat(48)}`);
    cleanup();
    fetchMock.mockReturnValueOnce(reply({ state: 'already' }));
    at(`/email/confirm?t=${'c'.repeat(48)}`, <EmailConfirmPage />, '/email/confirm');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Already signed up');
  });

  it('an unknown link is not recognised', async () => {
    fetchMock.mockReturnValueOnce(reply({ state: 'invalid' }));
    at('/email/confirm?t=nope', <EmailConfirmPage />, '/email/confirm');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Link not recognised');
  });

  it('unsubscribes in one click', async () => {
    fetchMock.mockReturnValueOnce(reply({ state: 'unsubscribed' }));
    at(`/email/unsubscribe?t=${'d'.repeat(48)}`, <EmailUnsubscribePage />, '/email/unsubscribe');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('You’re unsubscribed');
    expect(sent()).toEqual({ action: 'unsubscribe', token: 'd'.repeat(48) });
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
  });
});

describe('privacy page', () => {
  it('covers the email list, Resend, retention, rights, analytics and the contact address', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>);
    const text = screen.getByTestId('privacy-page').textContent ?? '';
    for (const s of ['your email address', 'FPL team ID', 'Resend', 'standard contractual clauses', 'deleted within 30 days',
      'after 7 days', 'Google Analytics only if you accept', 'Cloudflare Web Analytics', 'Information Commissioner', 'privacy@fixtureshark.com']) {
      expect(text, s).toContain(s);
    }
    expect(screen.getAllByRole('link', { name: 'privacy@fixtureshark.com' })[0]).toHaveAttribute('href', 'mailto:privacy@fixtureshark.com');
  });

  it('is prerendered with its body and listed as a static route', async () => {
    const { renderStaticRouteHead } = await import('../entry-server');
    const { STATIC_ROUTES } = await import('../lib/routeMeta');
    const meta = STATIC_ROUTES.find((m) => m.path === '/privacy')!;
    expect(meta).toBeTruthy();
    const page = renderStaticRouteHead(meta);
    expect(page.html).toContain('Privacy notice');
    expect(page.html).toContain('privacy@fixtureshark.com');
    expect(page.canonical).toMatch(/\/privacy$/);
  });
});

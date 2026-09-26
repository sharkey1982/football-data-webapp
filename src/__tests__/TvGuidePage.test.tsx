import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TvGuidePage from '../pages/football/TvGuidePage';
import * as broadcastsApi from '../lib/broadcastsApi';
import * as commercialLinks from '../lib/commercialLinks';
import * as analytics from '../lib/analytics';
import type { WatchOffer } from '../lib/watchGuide';

vi.mock('../lib/broadcastsApi', async () => {
  const actual = await vi.importActual<typeof broadcastsApi>('../lib/broadcastsApi');
  return { ...actual, getWatchGuide: vi.fn() };
});
vi.mock('../lib/commercialLinks', async () => {
  const actual = await vi.importActual<typeof commercialLinks>('../lib/commercialLinks');
  return { ...actual, getActivePartners: vi.fn().mockResolvedValue([]) };
});
vi.mock('../lib/analytics', () => ({ trackEvent: vi.fn() }));

const mockedBroadcasts = vi.mocked(broadcastsApi);
const mockedCommercialLinks = vi.mocked(commercialLinks);
const mockedTrackEvent = vi.mocked(analytics.trackEvent);
const render_ = () => render(<MemoryRouter><TvGuidePage /></MemoryRouter>);

let nextId = 1;
const offer = (over: Partial<WatchOffer> = {}): WatchOffer => ({
  broadcastId: nextId++, status: 'confirmed_broadcast', broadcaster: 'Sky Sports', channel: 'Sky Sports Main Event',
  streamingService: null, serviceProduct: null, accessType: 'subscription', deliveryMethods: [], platformDevice: null,
  isFast: false, isFreeToAir: false, isSubscription: true, isPpv: false, watchUrl: null, confidence: 'confirmed_primary',
  availabilityNotes: null, source: 'test source', sourceUrl: null, verifiedAt: new Date().toISOString(), ...over,
});
const fixture = (id: number, home: string, away: string, offers: WatchOffer[], over: Partial<broadcastsApi.WatchGuideFixture> = {}): broadcastsApi.WatchGuideFixture => ({
  fixtureId: id, slug: `${home}-v-${away}`.toLowerCase().replace(/ /g, '-'), kickoffDate: '2099-10-10', kickoffTime: '20:00:00',
  leagueCode: 'E0', leagueName: 'Premier League', countryName: 'England', competitionType: 'league', leagueTier: null,
  homeTeamName: home, awayTeamName: away, homeTeamCountry: 'England', awayTeamCountry: 'England',
  predictedHomeGoals: null, predictedAwayGoals: null, offers, ...over,
});
const row = (name: string) => screen.getByRole('link', { name }).closest('li')!;

beforeEach(() => {
  mockedCommercialLinks.getActivePartners.mockResolvedValue([]);
});

describe('TvGuidePage -- UK Watch Guide', () => {
  it('shows each state clearly: subscription, free, multiple free routes, PPV, not televised', async () => {
    mockedBroadcasts.getWatchGuide.mockResolvedValue([
      fixture(1, 'Charlton', 'Bristol City', [offer({ channel: 'Sky Sports+', serviceProduct: 'Sky Sports+ / Sky Sports app / NOW' })], { leagueName: 'Championship' }),
      fixture(2, 'Stenhousemuir', 'Livingston', [offer({ broadcaster: 'BBC', channel: 'BBC Scotland', serviceProduct: 'BBC Scotland / BBC iPlayer', accessType: 'free', isFreeToAir: true, isSubscription: false })]),
      fixture(3, 'Borussia Dortmund', 'Werder Bremen', [
        offer({ broadcaster: 'BBC', channel: null, serviceProduct: 'BBC iPlayer', accessType: 'free', isFreeToAir: true, isSubscription: false }),
        offer({ broadcaster: 'Samsung TV Plus', channel: 'Bundesliga FAST Channel', accessType: 'free_compatible_device', platformDevice: 'Samsung TV Plus compatible devices', isFast: true, isSubscription: false }),
      ], { leagueName: 'Bundesliga' }),
      fixture(4, 'Arsenal', 'Borussia Dortmund', [offer({ broadcaster: 'Amazon Prime Video', channel: null, streamingService: 'Prime Video', accessType: 'ppv', isPpv: true, isSubscription: false })], { leagueName: 'UEFA Champions League' }),
      fixture(5, 'Millwall', 'Lincoln', [offer({ status: 'confirmed_not_televised', broadcaster: null, channel: null, accessType: null, isSubscription: false })], { leagueName: 'Championship' }),
    ]);
    render_();
    await screen.findByRole('link', { name: 'Charlton v Bristol City' });

    const sub = row('Charlton v Bristol City');
    expect(within(sub).getByText('Watch live')).toBeInTheDocument();
    expect(within(sub).getByText('Sky Sports+')).toBeInTheDocument();
    expect(within(sub).getByText(/Requires Sky Sports subscription/)).toBeInTheDocument();
    expect(within(sub).getByText(/also via Sky Sports app, NOW/)).toBeInTheDocument();

    const free = row('Stenhousemuir v Livingston');
    expect(within(free).getByText(/Watch live — free/)).toBeInTheDocument();
    expect(within(free).getByText(/Free in the UK/)).toBeInTheDocument();

    const multi = row('Borussia Dortmund v Werder Bremen');
    expect(within(multi).getByText('BBC iPlayer')).toBeInTheDocument();
    expect(within(multi).getByText('Bundesliga FAST Channel')).toBeInTheDocument();
    expect(within(multi).getByText(/Free on Samsung TV Plus compatible devices/)).toBeInTheDocument();
    // Two tiers, free first, both listed rather than flattened.
    const tiers = within(multi).getAllByText(/^Free( — compatible device)?$/).map((n) => n.textContent);
    expect(tiers).toEqual(['Free', 'Free — compatible device']);

    const ppv = row('Arsenal v Borussia Dortmund');
    expect(within(ppv).getByText(/Watch live — pay-per-view/)).toBeInTheDocument();
    expect(within(ppv).getByText(/Extra payment/)).toBeInTheDocument();

    const notLive = row('Millwall v Lincoln');
    expect(within(notLive).getByText('Not televised live in the UK')).toBeInTheDocument();
  });

  it('explains that an unlisted match is unconfirmed, and shows a plain empty state', async () => {
    mockedBroadcasts.getWatchGuide.mockResolvedValue([]);
    render_();
    expect(await screen.findByText('No confirmed UK broadcasts right now.')).toBeInTheDocument();
    expect(screen.getByText(/hasn.t had its UK broadcast confirmed yet/)).toBeInTheDocument();
  });

  it('quick filters: Free, PPV and Not on UK TV narrow the list; Clear restores it', async () => {
    mockedBroadcasts.getWatchGuide.mockResolvedValue([
      fixture(1, 'Charlton', 'Bristol City', [offer()]),
      fixture(2, 'Stenhousemuir', 'Livingston', [offer({ broadcaster: 'BBC', channel: 'BBC Scotland', accessType: 'free', isFreeToAir: true })]),
      fixture(4, 'Arsenal', 'Dortmund', [offer({ broadcaster: 'Amazon Prime Video', channel: null, accessType: 'ppv', isPpv: true })]),
      fixture(5, 'Millwall', 'Lincoln', [offer({ status: 'confirmed_not_televised', broadcaster: null, channel: null, accessType: null })]),
    ]);
    const user = userEvent.setup();
    render_();
    await screen.findByRole('link', { name: 'Charlton v Bristol City' });

    await user.click(screen.getByRole('button', { name: 'Free' }));
    expect(screen.getByRole('link', { name: 'Stenhousemuir v Livingston' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Charlton v Bristol City' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'PPV' }));
    expect(screen.getByRole('link', { name: 'Arsenal v Dortmund' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Stenhousemuir v Livingston' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Not on UK TV' }));
    expect(screen.getByRole('link', { name: 'Millwall v Lincoln' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Arsenal v Dortmund' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getAllByRole('link', { name: / v / })).toHaveLength(4);
  });

  it('service filter finds a match through any of its routes (e.g. NOW inside a Sky offer)', async () => {
    mockedBroadcasts.getWatchGuide.mockResolvedValue([
      fixture(1, 'Charlton', 'Bristol City', [offer({ serviceProduct: 'Sky Sports+ / Sky Sports app / NOW' })]),
      fixture(2, 'Celtic', 'Hearts', [offer({ broadcaster: 'Premier Sports', channel: 'Premier Sports' })]),
    ]);
    const user = userEvent.setup();
    render_();
    await screen.findByRole('link', { name: 'Charlton v Bristol City' });
    await user.selectOptions(screen.getByLabelText('Service'), 'now');
    expect(screen.getByRole('link', { name: 'Charlton v Bristol City' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Celtic v Hearts' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Service'), 'premier_sports');
    expect(screen.getByRole('link', { name: 'Celtic v Hearts' })).toBeInTheDocument();
  });

  it('a watchUrl matching an active partner resolves to the affiliate link, discloses it, and tracks the click', async () => {
    mockedBroadcasts.getWatchGuide.mockResolvedValue([
      fixture(1, 'Arsenal', 'Leeds', [offer({ watchUrl: 'https://www.nowtv.com/watch/some-match', broadcaster: 'NOW' })]),
    ]);
    mockedCommercialLinks.getActivePartners.mockResolvedValue([
      { partnerId: 1, name: 'NOW', category: 'streaming', network: 'Awin', canonicalDomain: 'nowtv.com',
        affiliateUrlTemplate: 'https://www.awin1.com/cread.php?p={url}', market: 'GB' },
    ]);
    const user = userEvent.setup();
    render_();
    const link = await screen.findByRole('link', { name: 'Watch' });
    expect(link).toHaveAttribute('href', `https://www.awin1.com/cread.php?p=${encodeURIComponent('https://www.nowtv.com/watch/some-match')}`);
    expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Ad' })).toHaveAttribute('href', '/affiliate-disclosure');
    await user.click(link);
    expect(mockedTrackEvent).toHaveBeenCalledWith('affiliate_click', expect.objectContaining({ partner: 'NOW', page: 'tv_guide' }));
  });

  it('keeps provenance secondary: source and verified date sit behind a disclosure', async () => {
    mockedBroadcasts.getWatchGuide.mockResolvedValue([
      fixture(1, 'Arsenal', 'Leeds', [offer({ source: 'Premier League fixture list', sourceUrl: 'https://example.com/pl', verifiedAt: '2026-09-25T00:00:00Z' })]),
    ]);
    render_();
    await screen.findAllByText(/Verified 25 Sep/);
    const details = document.querySelector('details')!;
    expect(details.querySelector('summary')!.textContent).toMatch(/^Verified 25 Sep/);
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByRole('link', { name: 'Premier League fixture list' })).toHaveAttribute('rel', 'nofollow noopener noreferrer');
  });

  it('team picker: search by accent-free name finds the club, and European ties still show', async () => {
    mockedBroadcasts.getWatchGuide.mockResolvedValue([
      fixture(1, 'FC Bayern München', 'Borussia Dortmund', [offer()], { leagueCode: 'D1', leagueName: 'Bundesliga', countryName: 'Germany', leagueTier: 1, homeTeamCountry: 'Germany', awayTeamCountry: 'Germany' }),
      fixture(2, 'Arsenal', 'FC Bayern München', [offer()], { leagueCode: 'UCL', leagueName: 'UEFA Champions League', countryName: 'Europe', competitionType: 'cup', awayTeamCountry: 'Germany' }),
      fixture(3, 'Arsenal', 'Leeds', [offer()]),
    ]);
    const user = userEvent.setup();
    render_();
    await screen.findByRole('link', { name: 'Arsenal v Leeds' });
    const box = screen.getByRole('combobox', { name: 'Team' });
    await user.type(box, 'munchen');
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['FC Bayern München']);
    await user.click(options[0]);
    // Domestic and European fixtures both show; the unrelated one doesn't.
    expect(screen.getByRole('link', { name: 'FC Bayern München v Borussia Dortmund' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Arsenal v FC Bayern München' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Arsenal v Leeds' })).not.toBeInTheDocument();
  });

  it('picking a whole division shows every fixture its clubs play, European ties included', async () => {
    mockedBroadcasts.getWatchGuide.mockResolvedValue([
      fixture(1, 'Arsenal', 'Leeds', [offer()]),
      fixture(2, 'Arsenal', 'FC Bayern München', [offer()], { leagueCode: 'UCL', leagueName: 'UEFA Champions League', countryName: 'Europe', competitionType: 'cup', awayTeamCountry: 'Germany' }),
      fixture(3, 'Charlton', 'Bristol City', [offer()], { leagueCode: 'E1', leagueName: 'Championship' }),
    ]);
    const user = userEvent.setup();
    render_();
    await screen.findByRole('link', { name: 'Arsenal v Leeds' });
    await user.type(screen.getByRole('combobox', { name: 'Team' }), 'premier');
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'All Premier League clubs' }));
    expect(screen.getByRole('link', { name: 'Arsenal v Leeds' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Arsenal v FC Bayern München' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Charlton v Bristol City' })).not.toBeInTheDocument();
    expect(screen.getByText('Showing: All Premier League clubs')).toBeInTheDocument();
  });

  it('team picker groups clubs under country and division headings', async () => {
    mockedBroadcasts.getWatchGuide.mockResolvedValue([
      fixture(1, 'Charlton', 'Bristol City', [offer()], { leagueCode: 'E1', leagueName: 'Championship' }),
      fixture(2, 'Arsenal', 'Leeds', [offer()]),
    ]);
    const user = userEvent.setup();
    render_();
    await screen.findByRole('link', { name: 'Arsenal v Leeds' });
    await user.click(screen.getByRole('combobox', { name: 'Team' }));
    const list = screen.getByRole('listbox');
    expect(within(list).getByText('England · Premier League')).toBeInTheDocument();
    expect(within(list).getByText('England · Championship')).toBeInTheDocument();
  });

  it('calendar: selecting a date narrows the list; "Show all dates" restores it', async () => {
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const d1 = new Date(); d1.setDate(d1.getDate() + 1);
    const d2 = new Date(); d2.setDate(d2.getDate() + 2);
    mockedBroadcasts.getWatchGuide.mockResolvedValue([
      fixture(1, 'Arsenal', 'Leeds', [offer()], { kickoffDate: ymd(d1) }),
      fixture(2, 'Charlton', 'Bristol City', [offer()], { kickoffDate: ymd(d2) }),
    ]);
    const user = userEvent.setup();
    render_();
    await screen.findByRole('link', { name: 'Arsenal v Leeds' });
    // Only dates with fixtures are enabled; pick d2's day number.
    const day = screen.getAllByRole('button', { name: String(d2.getDate()) }).find((b) => !b.hasAttribute('disabled'));
    expect(day).toBeTruthy();
    await user.click(day!);
    expect(screen.queryByRole('link', { name: 'Arsenal v Leeds' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Charlton v Bristol City' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all dates' }));
    expect(screen.getByRole('link', { name: 'Arsenal v Leeds' })).toBeInTheDocument();
  });

  it('Saturday 3pm rule rows read as not televised, with the reason and no source or verified date', async () => {
    mockedBroadcasts.getWatchGuide.mockResolvedValue([
      fixture(1, 'Aston Villa', 'Brentford', [offer({
        status: 'confirmed_not_televised', broadcaster: null, channel: null, accessType: null, isSubscription: false,
        source: 'rule:3pm_blackout', confidence: 'probable', availabilityNotes: 'Saturday 3pm kick-offs are not shown live in the UK.',
      })], { kickoffTime: '15:00:00' }),
    ]);
    const user = userEvent.setup();
    render_();
    await screen.findByRole('link', { name: 'Aston Villa v Brentford' });
    const r = row('Aston Villa v Brentford');
    expect(within(r).getByText('Not televised live in the UK')).toBeInTheDocument();
    expect(within(r).getByText('Saturday 3pm kick-offs are not shown live in the UK.')).toBeInTheDocument();
    expect(within(r).queryByText(/rule:3pm_blackout/)).not.toBeInTheDocument();
    expect(within(r).queryByText(/Verified/)).not.toBeInTheDocument();
    expect(within(r).queryByText(/Broadcaster TBC/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Not on UK TV' }));
    expect(screen.getByRole('link', { name: 'Aston Villa v Brentford' })).toBeInTheDocument();
  });

  it('shows an error message if the load fails, rather than a blank page', async () => {
    mockedBroadcasts.getWatchGuide.mockRejectedValue(new Error('boom'));
    render_();
    expect(await screen.findByText('boom')).toBeInTheDocument();
  });
});

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TvGuidePage from '../pages/football/TvGuidePage';
import * as broadcastsApi from '../lib/broadcastsApi';
import * as commercialLinks from '../lib/commercialLinks';
import * as analytics from '../lib/analytics';

vi.mock('../lib/broadcastsApi', async () => {
  const actual = await vi.importActual<typeof broadcastsApi>('../lib/broadcastsApi');
  return { ...actual, getUpcomingBroadcastFixtures: vi.fn() };
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

const fixture = (over: Partial<broadcastsApi.UpcomingBroadcastFixture> = {}): broadcastsApi.UpcomingBroadcastFixture => ({
  broadcastId: 1, market: 'GB', broadcaster: 'Sky Sports', channel: 'Sky Sports Main Event',
  streamingService: 'NOW', isFreeToAir: false, isSubscription: true, isPpv: false, watchUrl: null,
  fixtureId: 501, slug: 'arsenal-v-leeds-2026-10-10', kickoffDate: '2026-10-10', kickoffTime: '12:30:00',
  leagueId: 1, leagueCode: 'E0', leagueName: 'Premier League', countryName: 'England',
  homeTeamId: 1, homeTeamName: 'Arsenal', awayTeamId: 2, awayTeamName: 'Leeds',
  ...over,
});

describe('TvGuidePage', () => {
  it('shows nothing-yet state when no fixtures have a confirmed broadcast', async () => {
    mockedBroadcasts.getUpcomingBroadcastFixtures.mockResolvedValue([]);
    render_();
    await waitFor(() => expect(screen.getByText(/No fixtures with a confirmed UK broadcast/)).toBeInTheDocument());
  });

  it('groups fixtures by date and links through to the match page', async () => {
    mockedBroadcasts.getUpcomingBroadcastFixtures.mockResolvedValue([fixture()]);
    render_();
    await waitFor(() => expect(screen.getByText('Arsenal v Leeds')).toBeInTheDocument());
    expect(screen.getByText('Sky Sports Main Event')).toBeInTheDocument();
    expect(screen.getByText(/Premier League.*England/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Arsenal v Leeds' })).toHaveAttribute('href', '/football/matches/arsenal-v-leeds-2026-10-10');
  });

  it('a watchUrl matching an active partner resolves to the affiliate link, discloses it, and tracks the click', async () => {
    mockedBroadcasts.getUpcomingBroadcastFixtures.mockResolvedValue([
      fixture({ watchUrl: 'https://www.nowtv.com/watch/some-match', broadcaster: 'NOW' }),
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

  it('filters to a single team, matching either home or away, and clears with the Clear filters control', async () => {
    mockedBroadcasts.getUpcomingBroadcastFixtures.mockResolvedValue([
      fixture({ broadcastId: 1, homeTeamName: 'Arsenal', awayTeamName: 'Leeds', slug: 'arsenal-v-leeds' }),
      fixture({ broadcastId: 2, homeTeamName: 'Chelsea', awayTeamName: 'Arsenal', slug: 'chelsea-v-arsenal', kickoffDate: '2026-10-11' }),
      fixture({ broadcastId: 3, homeTeamName: 'Everton', awayTeamName: 'Fulham', slug: 'everton-v-fulham', kickoffDate: '2026-10-12' }),
    ]);
    const user = userEvent.setup();
    render_();
    await waitFor(() => expect(screen.getByText('Everton v Fulham')).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText('Team'), 'Arsenal');
    expect(screen.getByText('Arsenal v Leeds')).toBeInTheDocument();
    expect(screen.getByText('Chelsea v Arsenal')).toBeInTheDocument();
    expect(screen.queryByText('Everton v Fulham')).not.toBeInTheDocument();

    await user.click(screen.getByText('Clear filters'));
    expect(screen.getByText('Everton v Fulham')).toBeInTheDocument();
  });

  it('shows an error message if the load fails, rather than a blank page', async () => {
    mockedBroadcasts.getUpcomingBroadcastFixtures.mockRejectedValue(new Error('network down'));
    render_();
    await waitFor(() => expect(screen.getByText('network down')).toBeInTheDocument());
  });
});
